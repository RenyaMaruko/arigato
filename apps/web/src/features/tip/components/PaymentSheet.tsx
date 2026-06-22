import { useTranslation } from "react-i18next";

/**
 * 支払い方法ボトムシート（モック決済）。
 * 決済ボタン押下で下からせり上がり（sheetUp）、背面にスクリムを敷く。
 * ✕ またはスクリムをタップすると onClose で閉じる（入力は親のストアが保持するため失われない）。
 * Apple Pay / Google Pay / カードのいずれかを押すと onPay が呼ばれ、モック決済が成立する。
 */
type Props = {
  // シートの開閉状態
  open: boolean;
  // 決済処理中（連打防止・ボタン無効化に使う）
  processing: boolean;
  // ✕・スクリムで閉じる
  onClose: () => void;
  // 支払い方法を選んだ（モック決済を成立させる）
  onPay: () => void;
};

export function PaymentSheet({ open, processing, onClose, onPay }: Props) {
  const { t } = useTranslation();

  // 閉じているときは何も描画しない（背面操作を妨げない）
  if (!open) return null;

  return (
    // シート全体を端末枠内に絶対配置する（PhoneFrame の relative コンテナが基準）
    <div className="absolute inset-0 z-10">
      {/* 背面スクリム（タップで閉じる） */}
      <button
        type="button"
        aria-label={t("tip.sheetClose")}
        onClick={onClose}
        className="absolute inset-0 animate-scrim-in bg-scrim"
      />

      {/* ボトムシート本体（下からせり上がる） */}
      <div className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-2xl bg-page px-6 pb-[34px] pt-[14px] shadow-sheet">
        {/* ドラッグハンドル */}
        <div className="mb-[14px] flex justify-center">
          <span className="h-1 w-[38px] rounded-pill bg-handle" />
        </div>

        {/* タイトル + ✕ */}
        <div className="relative mb-5 flex items-center justify-center">
          <span className="text-token-xl font-bold text-ink">{t("tip.sheetTitle")}</span>
          <button
            type="button"
            aria-label={t("tip.sheetClose")}
            onClick={onClose}
            className="absolute right-0 text-[18px] text-muted"
          >
            ✕
          </button>
        </div>

        {/* Apple Pay（最優先・黒） */}
        <button
          type="button"
          disabled={processing}
          onClick={onPay}
          className="block w-full rounded-xl bg-apple-pay py-[17px] text-center text-token-xl font-semibold text-page disabled:opacity-60"
        >
          {processing ? t("tip.processing") : t("tip.applePay")}
        </button>

        {/* Google Pay */}
        <button
          type="button"
          disabled={processing}
          onClick={onPay}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-line bg-page py-[17px] text-center text-token-xl font-semibold text-ink disabled:opacity-60"
        >
          <span className="text-token-2xl font-bold text-google-blue">G</span>
          {t("tip.googlePay")}
        </button>

        {/* 区切り（または） */}
        <div className="my-[22px] flex items-center gap-3">
          <div className="h-px flex-1 bg-line-soft" />
          <span className="text-token-sm text-muted">{t("tip.or")}</span>
          <div className="h-px flex-1 bg-line-soft" />
        </div>

        {/* カードで支払う */}
        <button
          type="button"
          disabled={processing}
          onClick={onPay}
          className="flex w-full items-center justify-center gap-[9px] rounded-xl border-[1.5px] border-line bg-page py-[17px] text-center text-token-lg font-semibold text-ink disabled:opacity-60"
        >
          {t("tip.cardPay")}
        </button>

        {/* 安心メッセージ */}
        <div className="mt-[22px] text-center text-token-xs text-muted">{t("tip.secureNote")}</div>
      </div>
    </div>
  );
}
