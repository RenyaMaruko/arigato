import { getStripe } from "./stripe.client.js";
import type {
  CreateDirectChargeParams,
  DirectChargeResult,
  PaymentIntentStatusSnapshot,
} from "./stripe.types.js";

/**
 * Stripe Connect の分配処理（infrastructure 層・Direct charge）。
 *
 * 設計上の肝（資金移動規制の回避）:
 *  - 課金タイプは Direct charge。店員さんの Connected Account に直接課金し、
 *    運営は application_fee_amount（手数料）だけを受領する。お金は運営の残高を一度も経由しない。
 *  - Separate charges and transfers（運営が一旦受けて transfer する方式）は使わない。
 *    このファイルに transfer 経由の着金処理は一切書かない。
 *  - カード情報は自前サーバーに通さない。Stripe Checkout（ホスト型）へリダイレクトして
 *    決済 UI を Stripe に任せる（PCI 負担を最小化。Apple Pay / Google Pay も Stripe が提示）。
 *
 * Direct charge の作り方:
 *  - Checkout Session を「Connected Account のコンテキスト」で作成する
 *    （リクエストオプションに stripeAccount を渡す）。これにより charge / PaymentIntent は
 *    Connected Account 上に作られる＝直課金になる。
 *  - payment_intent_data.application_fee_amount に運営手数料を載せる。
 */

/**
 * 店員さんの Connected Account に対する Direct charge の決済セッションを作成する。
 * 返り値の checkoutUrl にお客さまをリダイレクトして決済してもらう。
 * 決済の確定はブラウザの戻り値ではなく Webhook を正とする（ここでは pending のセッションを作るだけ）。
 */
export async function createDirectChargeSession(
  params: CreateDirectChargeParams,
): Promise<DirectChargeResult> {
  const stripe = getStripe();

  // Checkout Session を Connected Account のコンテキストで作成する（= Direct charge）。
  // payment_method_types は指定しない（動的決済手段を有効化し、Apple Pay / Google Pay / カードを自動提示）。
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      // お客さま支払額（満額 + 上乗せ手数料）を1品目として提示する
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency,
            // JPY は最小単位＝1円のため、そのままの整数を渡す
            unit_amount: params.customerTotal,
            product_data: {
              name: `${params.staffDisplayName} さんへのありがとう`,
            },
          },
        },
      ],
      payment_intent_data: {
        // 運営の取り分（application_fee）。これだけが運営に入り、満額は店員さんへ届く
        application_fee_amount: params.applicationFeeAmount,
        // Webhook で自前 tip を特定するための metadata（PaymentIntent 側に載せる）
        metadata: { tipId: params.tipId },
      },
      // Webhook 取りこぼし対策・突合のため Session 側にも tip ID を残す
      metadata: { tipId: params.tipId },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    },
    // ★ Connected Account のコンテキストで実行 ＝ Direct charge（課金先が店員さんの口座）
    { stripeAccount: params.connectedAccountId },
  );

  // Checkout URL が無い場合は決済 UI に進めないためエラーにする
  if (!session.url) {
    throw new Error("Checkout Session の URL が取得できませんでした。");
  }

  // ホスト型 Checkout では PaymentIntent はお客さまが支払った時点で作られるため、
  // セッション作成直後は null のことがある。文字列 or 展開オブジェクトの両対応で取り出す。
  // Webhook 側は PaymentIntent の metadata.tipId で tip を特定できるよう、tipId を載せてある。
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  return {
    checkoutUrl: session.url,
    paymentIntentId,
    checkoutSessionId: session.id,
  };
}

/**
 * 突合ジョブ用: PaymentIntent の現在ステータスを Stripe から取得する。
 * Direct charge の PaymentIntent は Connected Account 上にあるため、stripeAccount を指定して読む。
 * Webhook 取りこぼし時に DB の tip.status と突合するための入口。
 */
export async function fetchPaymentIntentStatus(
  paymentIntentId: string,
  connectedAccountId: string,
): Promise<PaymentIntentStatusSnapshot> {
  const stripe = getStripe();
  const pi = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    {},
    { stripeAccount: connectedAccountId },
  );
  return { paymentIntentId: pi.id, status: pi.status };
}

/**
 * 突合ジョブ用: Checkout Session から PaymentIntent の現在ステータスを取得する。
 * ホスト型 Checkout では PaymentIntent はお客さまの支払い時に作られるため、tip 作成直後は
 * PaymentIntent ID が分からないことがある。その場合に Session ID から PaymentIntent を引き当て、
 * status を読む（Direct charge の Session は Connected Account 上にあるため stripeAccount 指定）。
 * 未支払い等で PaymentIntent がまだ無い場合は paymentIntentId=null・status=null を返す。
 */
export async function fetchCheckoutSessionPaymentStatus(
  checkoutSessionId: string,
  connectedAccountId: string,
): Promise<{ paymentIntentId: string | null; status: string | null }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(
    checkoutSessionId,
    {},
    { stripeAccount: connectedAccountId },
  );
  // PaymentIntent はまだ作られていない（未支払い等）こともある
  if (!session.payment_intent) {
    return { paymentIntentId: null, status: null };
  }
  // 文字列 ID なら retrieve して status を読む。展開済みオブジェクトならそのまま使う。
  if (typeof session.payment_intent === "string") {
    const pi = await stripe.paymentIntents.retrieve(
      session.payment_intent,
      {},
      { stripeAccount: connectedAccountId },
    );
    return { paymentIntentId: pi.id, status: pi.status };
  }
  return {
    paymentIntentId: session.payment_intent.id,
    status: session.payment_intent.status,
  };
}

/**
 * 検証用: テスト用の Connected Account（Express ダッシュボード）を1つ作成する。
 * 本人確認は後ろ倒し（保留残高モデル）のため、未確認のままでも Direct charge は作れる。
 * 本番のオンボーディング/保留残高の本格実装は Sprint 5。ここでは E2E 検証のために
 * 「直課金できる Connected Account」を用意できる入口だけを提供する。
 *
 * controller プロパティで責務を明示する（Accounts v2 の思想に沿い、legacy type は使わない）。
 */
export async function createTestConnectedAccount(displayName: string): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    country: "JP",
    // controller で責務を明示（Express 相当: 手数料は運営負担、Express ダッシュボード、要件は Stripe 収集）
    controller: {
      losses: { payments: "application" },
      fees: { payer: "application" },
      stripe_dashboard: { type: "express" },
      requirement_collection: "stripe",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: displayName },
  });
  return account.id;
}
