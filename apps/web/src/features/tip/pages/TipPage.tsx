import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useStaffDisplayInfo, useCreateTipIntent } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";
import { AmountSelector } from "../components/AmountSelector.js";
import { MessageInput } from "../components/MessageInput.js";
import { PaymentSheet } from "../components/PaymentSheet.js";

/**
 * 投げ銭画面（/tip/:membershipId、モック 01/02）。
 * QR が指す所属（membership＝人×店）から、店員さんの表示情報（顔写真枠・名前・店名・一言）を出し、
 * 金額3択・メッセージを選んで「送る」から支払いシートを開く。
 *
 * 「送る」押下で投げ銭の PaymentIntent を作成し（Direct charge）、得られた client_secret を使って
 * シート内にアプリ内決済 UI（Express Checkout Element ＋ Payment Element）を埋め込む。
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
  // 投げ銭作成（PaymentIntent 作成・client_secret 取得）ミューテーション
  const createIntent = useCreateTipIntent(membershipId);

  // 決済中フラグの setter（埋め込みフォームの confirm 中・完了遷移時に状態を同期する）。
  // 値自体はシート内のフォームが管理するため、ここでは setter だけ使う。
  const [, setPaying] = useState(false);

  // UI 状態（選択中金額・メッセージ・シート開閉）は Zustand に集約
  const amount = useTipFormStore((s) => s.amount);
  const message = useTipFormStore((s) => s.message);
  const sheetOpen = useTipFormStore((s) => s.sheetOpen);
  const setAmount = useTipFormStore((s) => s.setAmount);
  const setMessage = useTipFormStore((s) => s.setMessage);
  const openSheet = useTipFormStore((s) => s.openSheet);
  const closeSheet = useTipFormStore((s) => s.closeSheet);

  // 「送る」押下: シートを開き、投げ銭の PaymentIntent を作成して client_secret を得る。
  // 得られた client_secret はシート内の Stripe Elements に渡してアプリ内決済 UI を埋め込む。
  const handleStartPay = () => {
    // 金額未選択時は送らない（UI 上は常にデフォルト選択済みだが安全のため）
    if (amount == null) return;
    // 先にシートを開く（ローディング → 決済 UI の順で表示する）
    openSheet();
    createIntent.mutate({
      amount,
      // 空文字メッセージは送らず undefined にする（任意入力のため）
      message: message.trim() === "" ? undefined : message.trim(),
    });
  };

  // 決済が（アプリ内で）成立したとき: 完了画面へ遷移する。
  // confirm の確定区分（succeeded＝即完了 / processing＝結果は後ほど）を search param で完了画面へ渡し、
  // succeeded はその場で完了表示する（Webhook を待たない）。processing のみ後続の確定を待つ。
  // tipId は intent 作成結果から取得する。
  const handlePaid = (status: "succeeded" | "processing") => {
    const tipId = createIntent.data?.tipId;
    if (!tipId) return;
    closeSheet();
    setPaying(false);
    navigate({
      to: "/tip/$membershipId/complete",
      params: { membershipId },
      search: { tipId, status },
    });
  };

  // シートを閉じるときは決済中フラグも戻す
  const handleCloseSheet = () => {
    closeSheet();
    setPaying(false);
  };

  // 決済確定後の戻り先 URL（PayPay 等リダイレクト必須手段でのみ使われる）。
  // リダイレクト型は基本「後日確定」のため status=processing を初期値として渡し、完了画面側で
  // Stripe が付ける redirect_status / payment_intent を見て succeeded なら即完了に切り替える。
  const tipId = createIntent.data?.tipId;
  const returnUrl = tipId
    ? `${window.location.origin}/tip/${membershipId}/complete?tipId=${tipId}&status=processing`
    : `${window.location.origin}/tip/${membershipId}`;

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

            {/* 送るボタン（押下で支払いシートを開き PaymentIntent を作成。
                ウォレット/カードはシート内のアプリ内決済 UI で選んで確定する） */}
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
      </div>

      {/* 支払い方法ボトムシート（アプリ内埋め込み決済 UI） */}
      <PaymentSheet
        open={sheetOpen}
        clientSecret={createIntent.data?.clientSecret ?? null}
        connectedAccountId={createIntent.data?.connectedAccountId ?? null}
        returnUrl={returnUrl}
        preparing={createIntent.isPending}
        hasError={createIntent.isError}
        onClose={handleCloseSheet}
        onPaid={handlePaid}
        onProcessingChange={setPaying}
      />
    </PhoneFrame>
  );
}
