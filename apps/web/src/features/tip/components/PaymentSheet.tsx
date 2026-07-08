import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { getConnectedStripe } from "../lib/stripe.js";
import { PaymentForm } from "./PaymentForm.js";

/**
 * 支払い方法ボトムシート（アプリ内埋め込み決済・2段構成）。
 * 「送る」押下で投げ銭の PaymentIntent を作成し、その client_secret が得られたら下からせり上がる。
 * シート内に Stripe Elements を埋め込み、PaymentForm が「支払い方法を選ぶ → 選んだ手段のUI」を出す:
 *   1. 選択ステップ: ウォレット（Express Checkout Element）／カードで支払う／PayPay で支払う
 *   2. カード入力ステップ: 「カードで支払う」押下時にだけ Payment Element を展開
 * Apple Pay / Google Pay はワンタップのネイティブ決済シート、カードは埋め込み入力で
 * アプリ内のまま決済を確定する（別ページにリダイレクトしない・カード情報は自前 API に通さない）。
 * ✕ またはスクリムをタップすると onClose で閉じる（入力は親のストアが保持するため失われない）。
 */
type Props = {
  // シートの開閉状態
  open: boolean;
  // PaymentIntent の client_secret（取得できるまでは決済 UI を出さずローディング表示）
  clientSecret: string | null;
  // Direct charge の課金先 Connected Account（Stripe.js を stripeAccount 指定で初期化するため）
  connectedAccountId: string | null;
  // 決済確定後の戻り先 URL（PayPay 等リダイレクト必須手段でのみ使われる）
  returnUrl: string;
  // PaymentIntent 作成中（client_secret 取得待ち）か
  preparing: boolean;
  // PaymentIntent 作成（決済開始）に失敗したか（エラー表示の出し分けに使う）
  hasError?: boolean;
  // ✕・スクリムで閉じる
  onClose: () => void;
  // 決済が（アプリ内で）成立したときに呼ぶ。confirm 結果の確定区分（succeeded＝即完了 /
  // processing＝結果は後ほど）を渡し、完了画面への遷移は親が行う
  onPaid: (status: "succeeded" | "processing") => void;
  // 決済処理中フラグの変化を親へ通知する
  onProcessingChange: (processing: boolean) => void;
};

export function PaymentSheet({
  open,
  clientSecret,
  connectedAccountId,
  returnUrl,
  preparing,
  hasError,
  onClose,
  onPaid,
  onProcessingChange,
}: Props) {
  const { t } = useTranslation();

  // Connected Account コンテキストで Stripe.js を初期化する（口座別キャッシュ）。
  // 口座が未確定のときは初期化しない（決済 UI を出さない）。
  const stripePromise = useMemo(
    () => (connectedAccountId ? getConnectedStripe(connectedAccountId) : null),
    [connectedAccountId],
  );

  // Elements に渡すオプション（client_secret と外観）。client_secret が無い間は Elements を組み立てない。
  const elementsOptions: StripeElementsOptions | null = useMemo(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      // デザイントークン（rose / ink）に寄せた最小限の外観。詳細は Designer が磨く。
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#ec3a6d",
          colorText: "#1f2024",
          fontFamily: "system-ui, sans-serif",
          borderRadius: "12px",
        },
      },
    };
  }, [clientSecret]);

  // 閉じているときは何も描画しない（背面操作を妨げない）
  if (!open) return null;

  return (
    // シート全体をビューポート基準で固定配置する（ドキュメントスクロール方式のため fixed。
    // 中身はアプリ幅 max-w-app に制約して中央へ。fixed のボトムナビ z-30 より上の z-50）
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 背面スクリム（タップで閉じる） */}
      <button
        type="button"
        aria-label={t("tip.sheetClose")}
        onClick={onClose}
        className="absolute inset-0 animate-scrim-in bg-scrim"
      />

      {/* ボトムシート本体（下からせり上がる） */}
      <div className="relative max-h-[88%] w-full max-w-app animate-sheet-up overflow-y-auto rounded-t-2xl bg-page px-6 pb-[34px] pt-[14px] shadow-sheet">
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

        {/* PaymentIntent 作成中（client_secret 取得待ち）はローディング表示 */}
        {preparing && !clientSecret && !hasError && (
          <div className="flex flex-col items-center py-10">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-line-soft border-t-rose" />
            <p className="mt-4 text-center text-token-md text-ink-sub">{t("tip.preparingPay")}</p>
          </div>
        )}

        {/* PaymentIntent 作成（決済開始）に失敗したとき */}
        {hasError && (
          <div className="py-8 text-center text-token-sm text-rose">{t("tip.payStartError")}</div>
        )}

        {/* client_secret が得られたらアプリ内に Stripe Elements を埋め込む */}
        {clientSecret && elementsOptions && stripePromise && (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentForm
              returnUrl={returnUrl}
              onPaid={onPaid}
              onProcessingChange={onProcessingChange}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
