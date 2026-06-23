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
 * アプリ内に埋め込む決済フォーム（2段構成）。
 *
 * モック03「支払い方法を選ぶ」に倣い、まず支払い手段を選ぶステップを出し、
 * 「カードで支払う」を押したときだけカード入力ステップへ展開する（全部を一度に出さない）。
 *
 * - 選択ステップ:
 *   - 上部に Express Checkout Element（Apple Pay / Google Pay / Link 等のウォレット）。
 *     タップで即ネイティブ決済シートが起動し、その場で確定する（別ページに飛ばない・ワンタップ）。
 *     使えるウォレットが無い環境（localhost の Apple Pay 等）では自動的に何も表示されない。
 *   - 「── または ──」区切り
 *   - 「クレジットカードで支払う」ボタン → カード入力ステップへ遷移
 *   - 「PayPay で支払う」ボタン → Stripe 審査前で未有効のため「準備中」で無効化（押してもクラッシュさせない）
 * - カード入力ステップ:
 *   - Payment Element をシート内に展開。「送る」で confirmPayment（redirect: "if_required"）。
 *   - 「支払い方法に戻る」で選択ステップへ戻れる。
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

// シート内のステップ（最初は支払い方法の選択、カードを選んだら入力ステップ）
type Step = "select" | "card";

export function PaymentForm({ returnUrl, onPaid, onProcessingChange }: Props) {
  const { t } = useTranslation();
  // Stripe.js / Elements のインスタンス（<Elements> から取得）
  const stripe = useStripe();
  const elements = useElements();

  // 表示中のステップ（select=支払い方法を選ぶ / card=カード入力）
  const [step, setStep] = useState<Step>("select");
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
    // カードフォームでは name / email / phone と国以外の住所欄を fields:"never" で非表示にしているため、
    // Stripe の仕様上、その分の billing_details を confirm 時に明示して渡す必要がある（渡さないと
    // IntegrationError になる）。投げ銭では請求先の本人情報は不要なので空（null）で渡す。
    // 国だけは Payment Element 側で収集しているので、ここでは渡さない（二重指定の競合を避ける）。
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            name: null,
            email: null,
            phone: null,
            address: {
              line1: null,
              line2: null,
              city: null,
              state: null,
              postal_code: null,
            },
          },
        },
      },
      redirect: "if_required",
    });
    handleConfirmResult(error ?? undefined);
  };

  // 「カードで支払う」→ カード入力ステップへ。エラー表示はリセットする。
  const goToCardStep = () => {
    setErrorMessage(null);
    setStep("card");
  };

  // 「支払い方法に戻る」→ 選択ステップへ。エラー表示はリセットする。
  const backToSelect = () => {
    setErrorMessage(null);
    setStep("select");
  };


  // カード入力ステップ: Payment Element を展開して入力させる
  if (step === "card") {
    return (
      <div>
        {/* 戻る導線 + ステップ見出し */}
        <button
          type="button"
          onClick={backToSelect}
          disabled={processing}
          className="mb-4 text-token-sm font-medium text-ink-sub disabled:opacity-50"
        >
          {t("tip.backToMethods")}
        </button>

        {/* カードの埋め込み入力（アプリ内・別ページ遷移なし）。
            お客さまに見せるのは「カード番号 / 有効期限 / セキュリティコード / 国」の最小構成だけにする。
            ・ウォレット（Apple Pay / Google Pay）は選択ステップの Express Checkout 側で出すため never。
            ・Link も never（never にしないと「情報を保存」チェックやメール欄が出てしまう）。
              ※ Link・Apple Pay・Google Pay はこの wallets ハッシュでしか抑制できない（PaymentIntent の
                excluded_payment_method_types に入れると Stripe がエラーになる）。
            ・コンビニ・銀行振込等のタブはサーバー側の excluded_payment_method_types で除外済みのため、
              ここではカードのみが残る。
            ・請求先は国だけ残し（auto）、郵便番号・名前・住所などの余計な欄は出さない。
            ・カードの法的文言（terms）も最小化のため非表示にする。 */}
        <PaymentElement
          options={{
            layout: "tabs",
            // Link を含むウォレットはカードフォームに出さない（Link の保存チェック/メール欄を消す）
            wallets: { applePay: "never", googlePay: "never", link: "never" },
            // 表示する請求先フィールドを最小化：国のみ残し、郵便番号・氏名・電話・メールは出さない
            fields: {
              billingDetails: {
                name: "never",
                email: "never",
                phone: "never",
                address: {
                  country: "auto",
                  postalCode: "never",
                  state: "never",
                  city: "never",
                  line1: "never",
                  line2: "never",
                },
              },
            },
            // カードの利用規約テキストは出さない（最小構成を保つ）
            terms: { card: "never" },
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
      </div>
    );
  }

  // 選択ステップ: 支払い方法を並べる（ウォレット → または → カード → PayPay）
  return (
    <div>
      {/* ウォレット（Apple Pay / Google Pay）。タップで即ネイティブ決済シートが起動して確定する。
          Link は使わないため無効化。使えるウォレットが無い環境（localhost の Apple Pay 等）では何も表示されない。 */}
      <ExpressCheckoutElement
        onConfirm={handleExpressConfirm}
        options={{
          // Link は無効化し、Apple Pay / Google Pay のみ表示する
          paymentMethods: { link: "never" },
          // ウォレットのボタンは黒系で統一（Apple Pay は黒が原則）
          buttonTheme: { applePay: "black", googlePay: "black" },
          buttonHeight: 48,
        }}
      />

      {/* ウォレットとカード/PayPay の間の余白 */}
      <div className="mt-[22px]" />

      {/* クレジットカードで支払う（押すとカード入力ステップを展開する） */}
      <button
        type="button"
        onClick={goToCardStep}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-line bg-page py-[17px] text-center text-token-md font-bold text-ink"
      >
        {t("tip.payWithCard")}
      </button>

      {/* PayPay で支払う（Stripe 審査前で未有効のため「準備中」で無効化）。
          Stripe で PayPay が有効化されたら disabled を外し、PayPay の payment method で
          confirmPayment（return_url 必須・リダイレクト）に差し替える想定。今は押せない。 */}
      <button
        type="button"
        disabled
        title={t("tip.paypayNotReady")}
        className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border-[1.5px] border-line bg-page py-[17px] text-center text-token-md font-bold text-muted opacity-60"
      >
        <span>{t("tip.payWithPaypay")}</span>
        <span className="rounded-pill bg-stamp-bg px-2 py-0.5 text-token-xs font-medium text-muted">
          {t("tip.paypayComingSoon")}
        </span>
      </button>

      {/* 案内・エラー（PayPay 未有効など） */}
      {errorMessage && (
        <div className="mt-[18px] text-center text-token-sm text-rose">{errorMessage}</div>
      )}
    </div>
  );
}
