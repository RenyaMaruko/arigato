import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useTipComplete } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";

// 後日確定手段（processing）の確認タイムアウト（ミリ秒）。これを過ぎても確定しなければ
// 「確認に時間がかかっています」案内に切り替える。永久ロードを避ける逃げ道。
const CONFIRM_TIMEOUT_MS = 30000;

/**
 * 完了画面（/tip/:membershipId/complete?tipId=&status=、モック 04）。
 * 見出しは置かず、誰に・¥◯◯（当該 tip の送金額）・入力したメッセージを再掲する。
 * メッセージ未入力なら枠は出さない。
 * 「もう一度送る」で投げ銭画面へ戻り、「閉じる」も同様に投げ銭画面へ戻る。
 *
 * 表示の「正」は2段構え:
 *  - お客さま向けの完了/失敗表示は、決済画面の confirmPayment が返した即時結果（search の status、
 *    または PayPay 等リダイレクト型の戻りで Stripe が付ける redirect_status）で出す。
 *    succeeded → 即・完了表示（tip.status のポーリング待ちはしない＝永久スピナーを廃止）。
 *    processing → 「受け付けました（結果は後ほど）」表示＋フォールバックでポーリング＋タイムアウト案内。
 *  - サーバーが failed を返したら従来どおり失敗表示。
 *  - status が無い直接アクセス（ブックマーク等）のときだけ、従来どおりサーバーの tip.status を待つ。
 * 残高・着金などサーバー側の確定は引き続き Webhook を正とする（この画面の表示には依存しない）。
 */
export function TipCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータ・クエリ（membership＝人×店）
  const { membershipId } = useParams({ from: "/tip/$membershipId/complete" });
  const { tipId, status, redirect_status } = useSearch({
    from: "/tip/$membershipId/complete",
  });

  // フォームを初期化する（もう一度送る/閉じる で新規入力に戻すため）
  const reset = useTipFormStore((s) => s.reset);

  // ブラウザの即時結果から「お客さま向け表示の確定区分」を決める。
  // PayPay 等リダイレクト型の戻りでは Stripe が redirect_status=succeeded を付けるので、これを優先する。
  const clientStatus: "succeeded" | "processing" | null = useMemo(() => {
    if (redirect_status === "succeeded") return "succeeded";
    if (status === "succeeded") return "succeeded";
    if (status === "processing") return "processing";
    return null;
  }, [status, redirect_status]);

  // succeeded を即時表示する場合、サーバーの tip.status を待つ必要はないのでポーリングを止める。
  // processing の場合と、status 無しの直接アクセスのときだけ後続の確定を待つ（ポーリング）。
  const pollUntilSettled = clientStatus !== "succeeded";

  // サーバー状態: 完了画面の再掲情報（誰に・金額・メッセージ）
  const { data: complete, isLoading, isError, refetch } = useTipComplete(
    membershipId,
    tipId,
    pollUntilSettled,
  );

  // 後続の確定待ち（processing / 直接アクセスで pending）が長引いたか。
  // 一定時間で案内を切り替え、永久ロードを防ぐ。succeeded 即時表示のときは待ちを行わない。
  const [timedOut, setTimedOut] = useState(false);
  // まだ確定待ちか（succeeded 即時表示でなく、かつサーバー側 tip がまだ pending）
  const isWaiting = clientStatus !== "succeeded" && complete?.status === "pending";
  useEffect(() => {
    // 待ちの間だけタイマーを張る。確定（succeeded/failed）したら解除・リセット
    if (!isWaiting) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isWaiting]);

  // 「もう一度確認する」: タイマーをリセットして再取得（ポーリングは継続）
  const recheck = () => {
    setTimedOut(false);
    refetch();
  };

  // 投げ銭画面へ戻る（フォームをリセットしてから遷移）
  const backToTip = () => {
    reset();
    navigate({ to: "/tip/$membershipId", params: { membershipId } });
  };

  // 完了表示を出してよいか:
  //  - クライアントが succeeded を確定済み → 即・完了表示（tip.status が pending でも表示する）
  //  - もしくはサーバーの tip.status が succeeded（直接アクセス・Webhook 確定後）
  const showSuccess =
    Boolean(complete) &&
    (clientStatus === "succeeded" || complete?.status === "succeeded");
  // 失敗表示（サーバーが failed を返した）。完了画面には進めない（情報は表示する）
  const showFailed = complete?.status === "failed";
  // 後日確定手段の「受け付けました」表示（processing。まだ確定待ちでタイムアウト前）
  const showProcessing =
    !showSuccess && !showFailed && clientStatus === "processing" && isWaiting && !timedOut;
  // 確定待ちのスピナー（status 無しの直接アクセス。タイムアウト前）
  const showWaitingSpinner =
    !showSuccess && !showFailed && clientStatus == null && isWaiting && !timedOut;
  // 確認が長引いたとき（processing / 直接アクセスのいずれか）のタイムアウト案内
  const showTimeout = !showSuccess && !showFailed && isWaiting && timedOut;

  return (
    <PhoneFrame>
      {/* 本文は内部スクロール（PhoneFrame の高さ固定に合わせ、縦に長くても破綻させない）。
          各状態の下部ボタンは mt-auto で下寄せ、内容が長い場合はこの領域内でスクロールする。 */}
      <div className="flex flex-1 flex-col overflow-y-auto px-[26px] pb-[30px] pt-2">
        {isLoading && (
          <p className="mt-10 text-center text-token-md text-ink-sub">{t("tip.loading")}</p>
        )}
        {isError && (
          <p className="mt-10 text-center text-token-md text-rose">{t("tip.notFound")}</p>
        )}

        {/* 後日確定手段（processing）: 「受け付けました（結果は後ほど）」表示。
            裏でポーリングを継続し、確定すれば自動で完了表示へ切り替わる */}
        {showProcessing && (
          <div className="mt-16 flex flex-1 flex-col items-center">
            {/* くるくる回るスピナー（受付済み・確定待ちの表現） */}
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-line-soft border-t-rose" />
            <p className="mt-6 text-center text-token-lg font-bold text-ink">
              {t("tip.paymentProcessing")}
            </p>
            <p className="mt-2 text-center text-token-md leading-[1.7] text-ink-sub">
              {t("tip.paymentProcessingNote")}
            </p>
          </div>
        )}

        {/* 確定待ち（status 無しの直接アクセス・タイムアウト前）: Webhook 確定を待ってスピナー表示 */}
        {showWaitingSpinner && (
          <div className="mt-16 flex flex-1 flex-col items-center">
            {/* くるくる回るスピナー（確認中の表現） */}
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-line-soft border-t-rose" />
            <p className="mt-6 text-center text-token-lg font-bold text-ink">
              {t("tip.confirming")}
            </p>
            <p className="mt-2 text-center text-token-md leading-[1.7] text-ink-sub">
              {t("tip.confirmingNote")}
            </p>
          </div>
        )}

        {/* 確認が長引いたとき（タイムアウト）: 永久ロードを避け、案内＋再確認/戻るを出す。
            裏ではポーリングを継続しているので、確定すれば自動で完了表示へ切り替わる */}
        {showTimeout && (
          <div className="flex flex-1 flex-col">
            <div className="mt-16 flex flex-col items-center">
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface-subtle text-token-3xl text-muted">
                ⏳
              </div>
              <p className="mt-6 text-center text-token-2xl font-bold text-ink">
                {t("tip.confirmTimeout")}
              </p>
              <p className="mt-2 text-center text-token-md leading-[1.7] text-ink-sub">
                {t("tip.confirmTimeoutNote")}
              </p>
            </div>
            <div className="mt-auto flex flex-col gap-3 pt-[30px]">
              <button
                type="button"
                onClick={recheck}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("tip.recheck")}
              </button>
              <button
                type="button"
                onClick={backToTip}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
              >
                {t("tip.close")}
              </button>
            </div>
          </div>
        )}

        {/* 決済失敗（failed）: 完了表示はせず、再試行を促す */}
        {showFailed && (
          <div className="flex flex-1 flex-col">
            <div className="mt-16 flex flex-col items-center">
              <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-surface-subtle text-token-display text-muted">
                ×
              </div>
              <p className="mt-6 text-center text-token-2xl font-bold text-ink">
                {t("tip.paymentFailed")}
              </p>
              <p className="mt-2 text-center text-token-md leading-[1.7] text-ink-sub">
                {t("tip.paymentFailedNote")}
              </p>
            </div>
            <div className="mt-auto pt-[30px]">
              <button
                type="button"
                onClick={backToTip}
                className="w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("tip.retry")}
              </button>
            </div>
          </div>
        )}

        {/* 決済成立（succeeded）: 完了表示。confirmPayment の即時結果で出すため Webhook を待たない */}
        {showSuccess && complete && (
          <>
            {/* 成功チェック（pop アニメ + 周囲の輝き spark） */}
            <div className="mt-14 flex justify-center">
              <div className="relative h-[108px] w-[108px] animate-pop">
                <div className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-rose text-token-display font-bold text-page">
                  ✓
                </div>
                {/* 周囲の輝き（装飾・順に現れる） */}
                <span className="absolute -left-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.35s]">
                  ＼
                </span>
                <span className="absolute -right-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.42s]">
                  ／
                </span>
                <span className="absolute -left-5 top-3.5 animate-spark text-token-base text-rose-spark [animation-delay:.5s]">
                  ·
                </span>
                <span className="absolute -right-5 top-3.5 animate-spark text-token-base text-rose-spark [animation-delay:.55s]">
                  ·
                </span>
              </div>
            </div>

            {/* 誰に・いくら の再掲 */}
            <div className="mt-[30px] text-center text-token-2xl leading-[1.8] text-ink">
              <span className="font-bold">{complete.staffDisplayName}</span> {t("tip.completeTo")}
              <br />
              <span className="font-bold">¥{complete.amount}</span> {t("tip.completeDelivered")}
            </div>

            {/* メッセージ再掲（未入力ならこの枠は出さない） */}
            {complete.message && (
              <div className="mt-6 rounded-xl border-[1.5px] border-line-soft bg-surface-subtle px-4 py-[15px]">
                <span className="text-token-md leading-[1.7] text-ink-label">
                  {complete.message}
                </span>
              </div>
            )}

            {/* アクション（下寄せ） */}
            <div className="mt-auto flex flex-col gap-3 pt-[30px]">
              <button
                type="button"
                onClick={backToTip}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("tip.sendAgain")}
              </button>
              <button
                type="button"
                onClick={backToTip}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
              >
                {t("tip.close")}
              </button>
            </div>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}
