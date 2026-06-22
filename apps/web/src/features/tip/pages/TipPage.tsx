import { useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useStaffDisplayInfo, useCreateTipIntent } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";
import { AmountSelector } from "../components/AmountSelector.js";
import { MessageInput } from "../components/MessageInput.js";
import { StampPicker } from "../components/StampPicker.js";
import { PaymentSheet } from "../components/PaymentSheet.js";
import { redirectToStripeCheckout } from "../lib/stripe.js";

/**
 * 投げ銭画面（/tip/:staffId、モック 01/02）。
 * 店員さんの表示情報（顔写真枠・名前・店名・一言）を出し、
 * 金額3択・メッセージ・スタンプを選んで「Pay で送る / G Pay で送る」から支払いシートを開く。
 * シート内のいずれかの支払い方法でモック決済が成立し、完了画面へ遷移する。
 * お客さま向けのため認証は不要（ログイン/登録なしで完結）。
 */
export function TipPage() {
  const { t } = useTranslation();
  // URL パラメータ（/tip/$staffId）
  const { staffId } = useParams({ from: "/tip/$staffId" });

  // サーバー状態: 店員さんの表示情報
  const { data: staff, isLoading, isError } = useStaffDisplayInfo(staffId);
  // 投げ銭作成（モック決済成立）ミューテーション
  const createIntent = useCreateTipIntent(staffId);

  // UI 状態（選択中金額・メッセージ・スタンプ・シート開閉）は Zustand に集約
  const amount = useTipFormStore((s) => s.amount);
  const message = useTipFormStore((s) => s.message);
  const stamp = useTipFormStore((s) => s.stamp);
  const sheetOpen = useTipFormStore((s) => s.sheetOpen);
  const setAmount = useTipFormStore((s) => s.setAmount);
  const setMessage = useTipFormStore((s) => s.setMessage);
  const toggleStamp = useTipFormStore((s) => s.toggleStamp);
  const openSheet = useTipFormStore((s) => s.openSheet);
  const closeSheet = useTipFormStore((s) => s.closeSheet);

  // 支払い方法を選んだとき: Stripe Direct charge の Checkout を作り、その URL へ遷移する。
  // カード情報は自前 API に通さず、Stripe Checkout（ホスト型）で入力させる。
  // 決済成立の確定は Webhook を正とし、完了画面は succeeded を待ってから表示する。
  const handlePay = () => {
    // 金額未選択時は送らない（UI 上は常にデフォルト選択済みだが安全のため）
    if (amount == null) return;
    createIntent.mutate(
      {
        amount,
        // 空文字メッセージは送らず undefined にする（任意入力のため）
        message: message.trim() === "" ? undefined : message.trim(),
        stamp: stamp ?? undefined,
      },
      {
        onSuccess: async (result) => {
          // シートを閉じてから Stripe Checkout へリダイレクト（カード情報は Stripe 側で入力）。
          // Stripe.js を初期化してからホスト型 Checkout の URL へ遷移する。
          closeSheet();
          await redirectToStripeCheckout(result.checkoutUrl);
        },
      },
    );
  };

  return (
    <PhoneFrame>
      {/* スクロール領域 */}
      <div className="flex-1 overflow-y-auto px-6 pb-7 pt-2">
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
              <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-stamp-bg text-token-sm text-muted">
                {staff.avatarUrl ? (
                  <img
                    src={staff.avatarUrl}
                    alt={staff.displayName}
                    className="h-[120px] w-[120px] rounded-full object-cover"
                  />
                ) : (
                  "顔写真"
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

            {/* スタンプを選ぶ（任意） */}
            <div className="mt-[22px] text-token-base font-bold text-ink-label">
              {t("tip.selectStamp")}{" "}
              <span className="font-normal text-muted">{t("tip.optional")}</span>
            </div>
            <StampPicker selected={stamp} onToggle={toggleStamp} />

            {/* 送るボタン群（押下で支払いシートを開く） */}
            <div className="mt-7 flex flex-col gap-[11px]">
              <button
                type="button"
                onClick={openSheet}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("tip.payWithApplePay")}
              </button>
              <button
                type="button"
                onClick={openSheet}
                className="flex items-center justify-center gap-[7px] rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
              >
                <span className="text-token-xl font-bold text-google-blue">G</span>
                {t("tip.payWithGooglePay")}
              </button>
            </div>
            <div className="mt-4 text-center text-token-xs text-muted">{t("tip.secureNote")}</div>
          </>
        )}
      </div>

      {/* 支払い方法ボトムシート（モック決済） */}
      <PaymentSheet
        open={sheetOpen}
        processing={createIntent.isPending}
        hasError={createIntent.isError}
        onClose={closeSheet}
        onPay={handlePay}
      />
    </PhoneFrame>
  );
}
