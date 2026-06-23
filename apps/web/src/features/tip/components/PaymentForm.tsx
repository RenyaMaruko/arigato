import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExpressCheckoutElement,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { StripeError } from "@stripe/stripe-js";

/**
 * アプリ内に埋め込む決済フォーム（Express Checkout Element ＋ Payment Element）。
 *
 * - 上部の Express Checkout Element は Apple Pay / Google Pay / Link 等のウォレットを表示し、
 *   タップするとネイティブ決済シートが即起動して決済を確定する（別ページに飛ばない・ワンタップ）。
 *   ウォレットが1つも使えない環境（localhost の Apple Pay 等）では何も表示されない。
 * - 区切り（または）の下の Payment Element はカード等の入力をアプリ内に埋め込む。
 *   送るボタン押下でアプリ内のまま確定する（カード情報は自前サーバーに通さない）。
 *
 * 確定は stripe.confirmPayment（redirect: "if_required"）で行い、ウォレット・カードは極力
 * アプリ内で完結させ、PayPay 等リダイレクト必須の手段のときだけ return_url へ遷移させる。
 * 成功確定の正は Webhook（payment_intent.succeeded）であり、ここでの成功は「完了画面へ進む合図」。
 * 完了画面は tip.status が succeeded になるまでポーリングして待つ（既存踏襲）。
 *
 * このコンポーネントは必ず <Elements>（client_secret 注入済み）の内側で使う。
 */
type Props = {
  // 決済確定後にお客さまを戻す URL（PayPay 等リダイレクト必須手段でのみ使われる）
  returnUrl: string;
  // 決済が（アプリ内で）成立したときに呼ぶ。完了画面への遷移は呼び出し側が行う
  onPaid: () => void;
  // 決済処理中フラグの変化を親へ通知する（送るボタンの無効化・スピナー表示に使う）
  onProcessingChange: (processing: boolean) => void;
};

export function PaymentForm({ returnUrl, onPaid, onProcessingChange }: Props) {
  const { t } = useTranslation();
  // Stripe.js / Elements のインスタンス（<Elements> から取得）
  const stripe = useStripe();
  const elements = useElements();

  // 決済中（連打防止・ボタン無効化）
  const [processing, setProcessing] = useState(false);
  // 決済エラーメッセージ（カード拒否・通信失敗など）
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 処理中フラグを更新し、親へも通知する（送るボタンの状態を同期）
  const setBusy = (busy: boolean) => {
    setProcessing(busy);
    onProcessingChange(busy);
  };

  // confirmPayment の結果を共通処理する（成功＝onPaid、失敗＝エラー表示）
  const handleConfirmResult = (error: StripeError | undefined) => {
    // エラーが無ければアプリ内で成立（または redirect 必須手段で遷移済み）→ 完了画面へ
    if (!error) {
      onPaid();
      return;
    }
    // validation / card_error はお客さま起因の表示用メッセージ。それ以外は汎用文言。
    if (error.type === "card_error" || error.type === "validation_error") {
      setErrorMessage(error.message ?? t("tip.payConfirmError"));
    } else {
      setErrorMessage(t("tip.payConfirmError"));
    }
    setBusy(false);
  };

  // ウォレット（Apple Pay / Google Pay 等）をタップして決済シートで確定したとき
  const handleExpressConfirm = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setErrorMessage(null);
    // ネイティブ決済シートで承認された支払いを確定する。リダイレクト必須手段のみ遷移する。
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    handleConfirmResult(error ?? undefined);
  };

  // カード等（Payment Element）の送るボタンを押して確定したとき
  const handleCardSubmit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setErrorMessage(null);
    // 入力値を検証・送信してから確定する
    const submitResult = await elements.submit();
    if (submitResult.error) {
      setErrorMessage(submitResult.error.message ?? t("tip.payConfirmError"));
      setBusy(false);
      return;
    }
    // アプリ内で確定。PayPay 等リダイレクト必須手段のときだけ return_url へ遷移する。
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    handleConfirmResult(error ?? undefined);
  };

  return (
    <div>
      {/* ウォレット（Apple Pay / Google Pay / Link）。タップで即ネイティブ決済シートが起動して確定する。
          使えるウォレットが無い環境（localhost の Apple Pay 等）では自動的に何も表示されない。 */}
      <ExpressCheckoutElement
        onConfirm={handleExpressConfirm}
        options={{
          // ウォレットのボタンは黒系で統一（Apple Pay は黒が原則）
          buttonTheme: { applePay: "black", googlePay: "black" },
          buttonHeight: 48,
        }}
      />

      {/* 区切り（または）。ウォレットとカード入力の間に置く */}
      <div className="my-[22px] flex items-center gap-3">
        <div className="h-px flex-1 bg-line-soft" />
        <span className="text-token-sm text-muted">{t("tip.or")}</span>
        <div className="h-px flex-1 bg-line-soft" />
      </div>

      {/* カード等の埋め込み入力（アプリ内・別ページ遷移なし） */}
      <PaymentElement
        options={{
          layout: "tabs",
          // ウォレットは上部の Express Checkout Element 側で出すため、こちらでは重複表示しない
          wallets: { applePay: "never", googlePay: "never" },
        }}
      />

      {/* カードで支払う（送る）ボタン */}
      <button
        type="button"
        disabled={processing || !stripe}
        onClick={handleCardSubmit}
        className="mt-5 block w-full rounded-xl bg-rose py-[17px] text-center text-token-lg font-bold text-page disabled:opacity-60"
      >
        {processing ? t("tip.processing") : t("tip.cardPaySubmit")}
      </button>

      {/* 決済エラー（カード拒否・通信失敗など） */}
      {errorMessage && (
        <div className="mt-[18px] text-center text-token-sm text-rose">{errorMessage}</div>
      )}

      {/* 安心メッセージ */}
      <div className="mt-[22px] text-center text-token-xs text-muted">{t("tip.secureNote")}</div>
    </div>
  );
}
