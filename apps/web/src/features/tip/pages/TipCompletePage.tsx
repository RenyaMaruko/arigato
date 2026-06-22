import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useTipComplete } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";
import { STAMP_EMOJI } from "../components/stamps.js";

/**
 * 完了画面（/tip/:staffId/complete?tipId=、モック 04）。
 * 「ありがとうを届けました！」を主役に大きく見せ、誰に・¥◯◯（当該 tip の送金額）・
 * 入力したメッセージ（とスタンプ）を再掲する。メッセージ未入力なら枠は出さない。
 * 「もう一度送る」で投げ銭画面へ戻り、「閉じる」も同様に投げ銭画面へ戻る。
 */
export function TipCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータ・クエリ
  const { staffId } = useParams({ from: "/tip/$staffId/complete" });
  const { tipId } = useSearch({ from: "/tip/$staffId/complete" });

  // サーバー状態: 完了画面の再掲情報（誰に・金額・メッセージ・スタンプ）
  const { data: complete, isLoading, isError } = useTipComplete(staffId, tipId);
  // フォームを初期化する（もう一度送る/閉じる で新規入力に戻すため）
  const reset = useTipFormStore((s) => s.reset);

  // 投げ銭画面へ戻る（フォームをリセットしてから遷移）
  const backToTip = () => {
    reset();
    navigate({ to: "/tip/$staffId", params: { staffId } });
  };

  // 完了見出しは i18n に改行（\n）を含むため <br> へ変換して描画する
  const titleLines = t("tip.completeTitle").split("\n");

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col px-[26px] pb-[30px] pt-2">
        {isLoading && (
          <p className="mt-10 text-center text-token-md text-ink-sub">{t("tip.loading")}</p>
        )}
        {isError && (
          <p className="mt-10 text-center text-token-md text-rose">{t("tip.notFound")}</p>
        )}

        {complete && (
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

            {/* 主役の見出し */}
            <div className="mt-[30px] text-center text-token-4xl font-bold leading-[1.4] text-rose">
              {titleLines.map((line, i) => (
                <span key={i}>
                  {line}
                  {i < titleLines.length - 1 && <br />}
                </span>
              ))}
            </div>

            {/* 誰に・いくら の再掲 */}
            <div className="mt-6 text-center text-token-2xl leading-[1.8] text-ink">
              <span className="font-bold">{complete.staffDisplayName}</span> {t("tip.completeTo")}
              <br />
              <span className="font-bold">¥{complete.amount}</span> {t("tip.completeDelivered")}
            </div>

            {/* メッセージ再掲（未入力ならこの枠は出さない） */}
            {complete.message && (
              <div className="mt-6 rounded-xl border-[1.5px] border-line-soft bg-surface-subtle px-4 py-[15px]">
                <span className="text-token-md leading-[1.7] text-ink-label">
                  {complete.stamp && <span className="mr-1.5">{STAMP_EMOJI[complete.stamp]}</span>}
                  {complete.message}
                </span>
              </div>
            )}

            {/* メッセージは無いがスタンプだけ添えた場合の再掲 */}
            {!complete.message && complete.stamp && (
              <div className="mt-6 text-center text-token-3xl">{STAMP_EMOJI[complete.stamp]}</div>
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
