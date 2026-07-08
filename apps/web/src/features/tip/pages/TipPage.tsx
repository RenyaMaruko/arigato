import { useEffect } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useStaffDisplayInfo } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";
import { AmountSelector } from "../components/AmountSelector.js";
import { MessageInput } from "../components/MessageInput.js";
import { PaymentSheet } from "../components/PaymentSheet.js";
import { getConnectedStripe } from "../lib/stripe.js";

/**
 * 投げ銭画面（/tip/:membershipId、モック 01/02）。
 * QR が指す所属（membership＝人×店）から、店員さんの表示情報（顔写真枠・名前・店名・一言）を出し、
 * 金額3択・メッセージを選んで「送る」から支払いシートを開く。
 *
 * 決済は Stripe の deferred intent 方式（現行標準）:
 *  - 決済 UI（Express Checkout Element ＋ Payment Element）は client_secret なしの
 *    Elements（mode:"payment"）でページ表示時点から組み立てておく。
 *  - 「送る」はシートを開くだけ。ウォレット判定は先に済んでいるため、
 *    Apple Pay / Google Pay ボタンとカードボタンが開いた瞬間に同時に表示される。
 *  - PaymentIntent（＝ tip 行）は「実際に支払う操作」をした瞬間にシート内で作成・確定する
 *    （シートを開いただけでは pending の tip 行を作らない＝孤児 intent を残さない）。
 * Apple Pay / Google Pay はワンタップのネイティブ決済シート、カードは埋め込み入力で
 * アプリ内のまま決済を確定する（別ページにリダイレクトしない）。
 * お客さま向けの完了/失敗表示は confirmPayment が返す PaymentIntent ステータスで即時に出す
 * （Webhook 到着を待たない）。残高・着金などサーバー側の確定は引き続き Webhook を正とする。
 * お客さま向けのため認証は不要（ログイン/登録なしで完結）。
 */
export function TipPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータ（/tip/$membershipId）。QR が指す所属（人×店）
  const { membershipId } = useParams({ from: "/tip/$membershipId" });

  // サーバー状態: membership から解決した店員さん（人）＋店の表示情報
  const { data: staff, isLoading, isError } = useStaffDisplayInfo(membershipId);

  // Stripe.js を先読みする（Apple Pay / Google Pay のボタンを「送る」押下後すぐ出すため）。
  // 読み込み結果は口座別にキャッシュされ、常時マウントの決済シート側の初期化で再利用される。
  // 失敗しても無視（シート側で再試行）。
  useEffect(() => {
    if (staff?.accepting && staff.connectedAccountId) {
      void getConnectedStripe(staff.connectedAccountId).catch(() => {});
    }
  }, [staff?.accepting, staff?.connectedAccountId]);

  // UI 状態（選択中金額・メッセージ・シート開閉）は Zustand に集約
  const amount = useTipFormStore((s) => s.amount);
  const message = useTipFormStore((s) => s.message);
  const sheetOpen = useTipFormStore((s) => s.sheetOpen);
  const setAmount = useTipFormStore((s) => s.setAmount);
  const setMessage = useTipFormStore((s) => s.setMessage);
  const openSheet = useTipFormStore((s) => s.openSheet);
  const closeSheet = useTipFormStore((s) => s.closeSheet);

  // 「送る」押下: シートを開くだけ（deferred 方式では intent 作成のトリガーではない）。
  // 決済 UI はページ表示時点で組み立て済みのため、ウォレット・カードボタンが即時に出る。
  const handleStartPay = () => {
    // 金額未選択時は送らない（UI 上は常にデフォルト選択済みだが安全のため）
    if (amount == null) return;
    openSheet();
  };

  // 決済が（アプリ内で）成立したとき: 完了画面へ遷移する。
  // confirm の確定区分（succeeded＝即完了 / processing＝結果は後ほど）を search param で完了画面へ渡し、
  // succeeded はその場で完了表示する（Webhook を待たない）。processing のみ後続の確定を待つ。
  // tipId は確定操作時に作成された intent の応答からシートが渡してくる。
  const handlePaid = (status: "succeeded" | "processing", tipId: string) => {
    closeSheet();
    navigate({
      to: "/tip/$membershipId/complete",
      params: { membershipId },
      search: { tipId, status },
    });
  };

  return (
    <PhoneFrame>
      {/* スクロール領域 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-7 pt-2">
        {/* 言語切替（表示のみ・本スプリントは日本語固定） */}
        <div className="flex justify-end">
          <span className="text-token-base text-lang">🌐 {t("tip.lang")} ⌄</span>
        </div>

        {/* 読み込み・エラー・本体の出し分け */}
        {isLoading && (
          <p className="mt-10 text-center text-token-md text-ink-sub">{t("tip.loading")}</p>
        )}
        {isError && (
          <p className="mt-10 text-center text-token-md text-rose">{t("tip.notFound")}</p>
        )}

        {staff && (
          <>
            {/* 顔写真枠（アバター） */}
            <div className="mt-1.5 flex justify-center">
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-stamp-bg text-muted">
                {staff.avatarUrl ? (
                  <img
                    src={staff.avatarUrl}
                    alt={staff.displayName}
                    className="h-[120px] w-[120px] rounded-full object-cover"
                  />
                ) : (
                  // 未設定は中立な人物アイコン（「顔写真」必須に見えないように）
                  <svg
                    width="56"
                    height="56"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
                  </svg>
                )}
              </div>
            </div>

            {/* 名前・店名 */}
            <div className="mt-4 text-center">
              <span className="text-token-3xl font-bold text-ink">{staff.displayName} </span>
              <span className="text-token-md text-ink">{t("tip.san")}</span>
            </div>
            <div className="mt-1 text-center text-token-md text-ink-sub">{staff.storeName}</div>
            {/* 一言（あれば表示） */}
            {staff.headline && (
              <div className="mt-1 text-center text-token-md text-muted">{staff.headline}</div>
            )}

            {/* 受付停止（脱退・在籍解除済みの QR）のときは、金額選択・送るを出さず案内だけを表示する。
                店員さんが再参加すると、同じ QR で受付を再開する。 */}
            {!staff.accepting ? (
              <div className="mt-8 rounded-2xl border-[1.5px] border-line bg-surface-subtle px-6 py-7 text-center">
                <div className="text-token-lg font-bold text-ink">{t("tip.notAcceptingTitle")}</div>
                <p className="mt-2 text-token-sm leading-relaxed text-ink-sub">
                  {t("tip.notAcceptingNote")}
                </p>
              </div>
            ) : (
              <>
                {/* 金額を選ぶ */}
                <div className="mt-[30px] text-token-base font-bold text-ink-label">
                  {t("tip.selectAmount")}
                </div>
                <AmountSelector selected={amount} onSelect={setAmount} />

                {/* メッセージを添える（任意） */}
                <div className="mt-[26px] text-token-base font-bold text-ink-label">
                  {t("tip.addMessage")}{" "}
                  <span className="font-normal text-muted">{t("tip.optional")}</span>
                </div>
                <MessageInput
                  value={message}
                  onChange={setMessage}
                  placeholder={t("tip.messagePlaceholder")}
                />

                {/* 送るボタン（押下で支払いシートを開くだけ。決済 UI は構築済みのため即表示され、
                    ウォレット/カードで確定した瞬間に intent が作成・確定される） */}
                <div className="mt-7 flex flex-col gap-[11px]">
                  <button
                    type="button"
                    onClick={handleStartPay}
                    disabled={amount == null}
                    className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-40"
                  >
                    {t("tip.send")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* 支払い方法ボトムシート（アプリ内埋め込み決済 UI・deferred intent 方式）。
          受付中の店員さんが表示できた時点から常時マウントし、ウォレット判定を先に済ませておく。
          開閉は表示だけの切り替え（open）。 */}
      {staff?.accepting && (
        <PaymentSheet
          open={sheetOpen}
          connectedAccountId={staff.connectedAccountId}
          membershipId={membershipId}
          onClose={closeSheet}
          onPaid={handlePaid}
        />
      )}
    </PhoneFrame>
  );
}
