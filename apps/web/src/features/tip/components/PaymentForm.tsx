import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExpressCheckoutElement,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type {
  ConfirmPaymentData,
  PaymentIntent,
  StripeError,
} from "@stripe/stripe-js";
import { useCreateTipIntent } from "../hooks/useTip.js";
import { useTipFormStore } from "../stores/tipFormStore.js";

/**
 * アプリ内に埋め込む決済フォーム（2段構成・deferred intent 方式）。
 *
 * モック03「支払い方法を選ぶ」に倣い、まず支払い手段を選ぶステップを出し、
 * 「カードで支払う」を押したときだけカード入力ステップへ展開する（全部を一度に出さない）。
 *
 * deferred intent 方式（Stripe 現行標準）のため、このフォームは client_secret なしの
 * <Elements>（mode:"payment"）内で常時マウントされる。Express Checkout Element の
 * ウォレット判定はシートを開く前に済んでおり、開いた瞬間にウォレット・カードが同時に出る。
 * PaymentIntent（＝ tip 行）は確定操作の瞬間に初めて作られる（孤児 pending を作らない）。
 *
 * 確定の順序は Stripe の deferred フロー公式手順に従う（ウォレット・カード共通）:
 *   1. elements.submit() — 入力検証・送信
 *   2. POST /tip/:membershipId/intent — tip 行（pending）＋ PaymentIntent を作成し client_secret を得る
 *      （金額はサーバーが入力 amount から独自計算＝改ざん耐性は既存のまま）
 *   3. stripe.confirmPayment({ elements, clientSecret, ... , redirect: "if_required" }) — 確定
 *
 * - 選択ステップ:
 *   - 上部に Express Checkout Element（Apple Pay / Google Pay 等のウォレット）。
 *     タップで即ネイティブ決済シートが起動し、承認後に上記 1→2→3 で確定する（別ページに飛ばない）。
 *     使えるウォレットが無い環境（localhost の Apple Pay 等）では自動的に何も表示されない。
 *   - 「クレジットカードで支払う」ボタン → カード入力ステップへ遷移
 *   - 「PayPay で支払う」ボタン → Stripe 審査前で未有効のため「準備中」で無効化（押してもクラッシュさせない）
 * - カード入力ステップ:
 *   - Payment Element をシート内に展開。「この内容で支払う」で上記 1→2→3 を実行する。
 *   - 「支払い方法に戻る」で選択ステップへ戻れる。
 *
 * お客さま向けの完了/失敗表示は「ブラウザの決済処理結果（confirmPayment が返す PaymentIntent
 * ステータス）」で即時に出す（Webhook 到着を待たない＝永久ロードを作らない）:
 *   - paymentIntent.status === "succeeded" → onPaid("succeeded", tipId)（即・完了表示）
 *   - paymentIntent.status === "processing"（PayPay 等の後日確定手段）→ onPaid("processing", tipId)
 *   - intent 作成失敗・confirm エラー → このシート内でその場でエラー表示（完了画面へ進めない）
 * なお店員さんの残高・受取履歴・着金の確定は引き続き Webhook を正としてサーバー側で行う。
 */
type Props = {
  // QR が指す所属（人×店）。確定時の intent 作成 API と戻り先 URL に使う
  membershipId: string;
  // シートの開閉状態（開き直したときにステップ・エラー表示をリセットするために受け取る）
  open: boolean;
  // 決済が（アプリ内で）成立したときに呼ぶ。confirm 結果の確定区分（即完了 / 結果は後ほど）と
  // 確定時に作成された tipId を渡す。完了画面への遷移は呼び出し側が行う
  onPaid: (status: "succeeded" | "processing", tipId: string) => void;
};

// シート内のステップ（最初は支払い方法の選択、カードを選んだら入力ステップ）
type Step = "select" | "card";

export function PaymentForm({ membershipId, open, onPaid }: Props) {
  const { t } = useTranslation();
  // Stripe.js / Elements のインスタンス（<Elements> から取得）
  const stripe = useStripe();
  const elements = useElements();

  // 確定時に tip 行＋PaymentIntent を作成するミューテーション（deferred 方式ではここが唯一の作成点）
  const createIntent = useCreateTipIntent(membershipId);

  // 選択中の金額・メッセージ（フォームストアが単一の源。Elements の amount と同じ値を使う）
  const amount = useTipFormStore((s) => s.amount);
  const message = useTipFormStore((s) => s.message);

  // 表示中のステップ（select=支払い方法を選ぶ / card=カード入力）
  const [step, setStep] = useState<Step>("select");
  // 決済中の UI 表示用フラグ（ボタン無効化・スピナー文言）。
  // ※ 二重発火防止の「正」はこれではなく下の submittingRef（docs/payment-bugs.md #10 参照）。
  const [processing, setProcessing] = useState(false);
  // 確定処理の二重発火を同期的に弾くガード（docs/payment-bugs.md #10 の教訓）。
  // useState の processing は非同期反映のため、同一タスク内の二重クリック・ECE の多重発火では
  // 再レンダー前に2回目が素通りし、intent（tip 行）が2本作られて二重課金になり得る。
  // 冪等でない確定操作は useRef で「あらゆる await より前に」同期的に弾く必要がある。
  const submittingRef = useRef(false);
  // 決済エラーメッセージ（intent 作成失敗・カード拒否・通信失敗など）
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // シートは常時マウントのため、開き直したときにステップとエラー表示を初期状態へ戻す
  // （処理中はリセットしない＝確定処理の表示を壊さない）
  useEffect(() => {
    if (open && !processing) {
      setStep("select");
      setErrorMessage(null);
    }
    // processing を依存に入れると処理完了時にもリセットされてしまうため、open の変化時だけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // confirmPayment の結果を共通処理する。
  // ブラウザの即時結果（PaymentIntent ステータス）で完了/失敗を出し分ける（Webhook を待たない）:
  //   - error 返却 → そのままシート内でエラー表示（完了画面へ進めない）
  //   - succeeded → onPaid("succeeded", tipId)（即・完了表示）
  //   - processing → onPaid("processing", tipId)（受け付けました。後続の確定だけ完了画面で待つ）
  //   - requires_action 等のリダイレクト必須手段で遷移済みのケースは error も paymentIntent も
  //     返らない（ページ遷移する）ため、ここには来ない
  const handleConfirmResult = (
    error: StripeError | undefined,
    paymentIntent: PaymentIntent | undefined,
    tipId: string,
  ) => {
    // 失敗（confirm エラー）→ その場でエラー表示
    if (error) {
      // validation / card_error はお客さま起因の表示用メッセージ。それ以外は汎用文言。
      if (error.type === "card_error" || error.type === "validation_error") {
        setErrorMessage(error.message ?? t("tip.payConfirmError"));
      } else {
        setErrorMessage(t("tip.payConfirmError"));
      }
      setProcessing(false);
      return;
    }
    // 後日確定手段（PayPay 等）→「受け付けました（結果は後ほど）」表示へ
    if (paymentIntent?.status === "processing") {
      onPaid("processing", tipId);
      return;
    }
    // それ以外（succeeded、または requires_capture 等で実質成立）→ 即・完了表示
    onPaid("succeeded", tipId);
  };

  // deferred フローの確定処理（ウォレット・カード共通）。
  // 順序は公式手順に従う: 1. elements.submit() → 2. intent 作成 → 3. confirmPayment。
  // confirmParams の追加分（カードの billing_details 明示など）は呼び出し側から受け取る。
  const payWithDeferredIntent = async (extraConfirmParams?: Partial<ConfirmPaymentData>) => {
    // 二重発火の同期ガード（あらゆる await より前・docs/payment-bugs.md #10）。
    // setState（processing）は非同期反映で再レンダー前の2回目を弾けないため、
    // ref を「正」として同一タスク内の二重クリック・多重発火をここで確実に止める。
    if (submittingRef.current) return;
    submittingRef.current = true;

    try {
      // 前提（Stripe 初期化済み・有効な金額）を確認。UI 表示用の processing も併せて更新する
      if (processing || !stripe || !elements || amount == null) return;
      setProcessing(true);
      setErrorMessage(null);

      // 【1】入力値を検証・送信する（deferred 方式では intent 作成前に必須）
      const submitResult = await elements.submit();
      if (submitResult.error) {
        setErrorMessage(submitResult.error.message ?? t("tip.payConfirmError"));
        setProcessing(false);
        return;
      }

      // 【2】tip 行（pending）＋ PaymentIntent をここで初めて作成する（支払う操作をした人の分だけ）。
      //     金額はサーバーが入力 amount から独自計算する（既存のまま＝改ざん耐性維持）。
      let tipId: string;
      let clientSecret: string;
      try {
        const intent = await createIntent.mutateAsync({
          amount,
          // 空文字メッセージは送らず undefined にする（任意入力のため）
          message: message.trim() === "" ? undefined : message.trim(),
        });
        tipId = intent.tipId;
        clientSecret = intent.clientSecret;
      } catch {
        // intent 作成失敗（決済開始エラー）→ シート内にその場で表示
        setErrorMessage(t("tip.payStartError"));
        setProcessing(false);
        return;
      }

      // 決済確定後の戻り先 URL（PayPay 等リダイレクト必須手段でのみ使われる）。
      // リダイレクト型は基本「後日確定」のため status=processing を初期値として渡し、完了画面側で
      // Stripe が付ける redirect_status / payment_intent を見て succeeded なら即完了に切り替える。
      const returnUrl = `${window.location.origin}/tip/${membershipId}/complete?tipId=${tipId}&status=processing`;

      // 【3】アプリ内で確定する。PayPay 等リダイレクト必須手段のときだけ return_url へ遷移する。
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: returnUrl,
          ...extraConfirmParams,
        },
        redirect: "if_required",
      });
      handleConfirmResult(error ?? undefined, paymentIntent ?? undefined, tipId);
    } finally {
      // 成功・submit エラー・intent 作成失敗・confirm 失敗のどの経路でも必ず解除する
      // （解除し忘れると以後の再試行が永久に弾かれるため finally で一元化。
      //   成功時は processing が true のまま＋完了画面へ遷移するため再発火の余地はない）
      submittingRef.current = false;
    }
  };

  // ウォレット（Apple Pay / Google Pay 等）をタップしてネイティブ決済シートで承認したとき
  const handleExpressConfirm = () => {
    void payWithDeferredIntent();
  };

  // カード等（Payment Element）の「この内容で支払う」を押して確定したとき。
  // カードフォームでは name / email / phone と国以外の住所欄を fields:"never" で非表示にしているため、
  // Stripe の仕様上、その分の billing_details を confirm 時に明示して渡す必要がある（渡さないと
  // IntegrationError になる）。投げ銭では請求先の本人情報は不要なので空（null）で渡す。
  // 国だけは Payment Element 側で収集しているので、ここでは渡さない（二重指定の競合を避ける）。
  const handleCardSubmit = () => {
    void payWithDeferredIntent({
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
    });
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
            ・コンビニ・銀行振込等のタブは Elements（deferred）とサーバー PI の両方で除外済みのため、
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

        {/* カードで支払う（確定）ボタン。処理中（intent 作成〜confirm）はスピナー文言＋無効化 */}
        <button
          type="button"
          disabled={processing || !stripe || amount == null}
          onClick={handleCardSubmit}
          className="mt-5 block w-full rounded-xl bg-rose py-[17px] text-center text-token-lg font-bold text-page disabled:opacity-60"
        >
          {processing ? t("tip.processing") : t("tip.cardPaySubmit")}
        </button>

        {/* 決済エラー（決済開始失敗・カード拒否・通信失敗など） */}
        {errorMessage && (
          <div className="mt-[18px] text-center text-token-sm text-rose">{errorMessage}</div>
        )}
      </div>
    );
  }

  // 選択ステップ: 支払い方法を並べる（ウォレット → カード → PayPay）
  return (
    <div>
      {/* ウォレット（Apple Pay / Google Pay）。deferred 方式のため client_secret 不要で
          ページ表示時点からマウント済み＝シートを開いた瞬間に表示される。
          タップで即ネイティブ決済シートが起動し、承認後に intent 作成 → confirm で確定する。
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

      {/* ウォレットとカードの間の余白 */}
      <div className="mt-[22px]" />

      {/* クレジットカードで支払う（押すとカード入力ステップを展開する） */}
      {/* PayPay は Stripe Connect が対応したら（現在プレビュー中）ここにボタンを追加し、
          PayPay の payment method で confirmPayment（return_url 必須・リダイレクト）を実装する想定 */}
      <button
        type="button"
        onClick={goToCardStep}
        disabled={processing}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-line bg-page py-[17px] text-center text-token-md font-bold text-ink disabled:opacity-60"
      >
        {t("tip.payWithCard")}
      </button>

      {/* 案内・エラー（決済開始失敗・ウォレット確定失敗など） */}
      {errorMessage && (
        <div className="mt-[18px] text-center text-token-sm text-rose">{errorMessage}</div>
      )}
    </div>
  );
}
