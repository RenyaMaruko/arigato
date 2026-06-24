import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useTipComplete } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";

// 決済確認のタイムアウト（ミリ秒）。これを過ぎても pending なら「確認に時間がかかっています」案内に切り替える。
// Webhook 確定は通常数秒だが、通信状況で遅れることがあるため、永久ロードを避ける逃げ道を設ける。
const CONFIRM_TIMEOUT_MS = 30000;

/**
 * 完了画面（/tip/:membershipId/complete?tipId=、モック 04）。
 * 見出しは置かず、誰に・¥◯◯（当該 tip の送金額）・入力したメッセージを再掲する。
 * メッセージ未入力なら枠は出さない。
 * 「もう一度送る」で投げ銭画面へ戻り、「閉じる」も同様に投げ銭画面へ戻る。
 */
export function TipCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータ・クエリ（membership＝人×店）
  const { membershipId } = useParams({ from: "/tip/$membershipId/complete" });
  const { tipId } = useSearch({ from: "/tip/$membershipId/complete" });

  // サーバー状態: 完了画面の再掲情報（誰に・金額・メッセージ）
  const { data: complete, isLoading, isError, refetch } = useTipComplete(membershipId, tipId);
  // フォームを初期化する（もう一度送る/閉じる で新規入力に戻すため）
  const reset = useTipFormStore((s) => s.reset);

  // 確認待ち（pending）が長引いたか。一定時間で案内を切り替え、永久ロードを防ぐ
  const [timedOut, setTimedOut] = useState(false);
  const isPending = complete?.status === "pending";
  useEffect(() => {
    // pending の間だけタイマーを張る。確定（succeeded/failed）したら解除・リセット
    if (!isPending) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

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

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col px-[26px] pb-[30px] pt-2">
        {isLoading && (
          <p className="mt-10 text-center text-token-md text-ink-sub">{t("tip.loading")}</p>
        )}
        {isError && (
          <p className="mt-10 text-center text-token-md text-rose">{t("tip.notFound")}</p>
        )}

        {/* 決済確認中（pending・タイムアウト前）: Webhook 確定を待ってスピナー表示 */}
        {complete && complete.status === "pending" && !timedOut && (
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
        {complete && complete.status === "pending" && timedOut && (
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
        {complete && complete.status === "failed" && (
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

        {/* 決済成立（succeeded）: 完了表示。Webhook で確定したものだけがここに到達する */}
        {complete && complete.status === "succeeded" && (
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
