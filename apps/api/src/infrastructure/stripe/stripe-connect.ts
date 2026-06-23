import { getStripe } from "./stripe.client.js";
import type {
  CreateDirectChargeParams,
  DirectChargeResult,
  PaymentIntentStatusSnapshot,
  CreateOnboardingLinkParams,
  CreateOnboardingLinkResult,
} from "./stripe.types.js";

/**
 * Stripe Connect の分配処理（infrastructure 層・Direct charge）。
 *
 * 設計上の肝（資金移動規制の回避）:
 *  - 課金タイプは Direct charge。店員さんの Connected Account に直接課金し、
 *    運営は application_fee_amount（手数料）だけを受領する。お金は運営の残高を一度も経由しない。
 *  - Separate charges and transfers（運営が一旦受けて transfer する方式）は使わない。
 *    このファイルに transfer 経由の着金処理は一切書かない。
 *  - カード情報は自前サーバーに通さない。PaymentIntent の client_secret をフロントへ返し、
 *    アプリ内に埋め込んだ Express Checkout Element（ウォレット）／ Payment Element（カード）で
 *    決済を確定する（PCI 負担を最小化。リダイレクト型 Checkout は使わない）。
 *
 * Direct charge の作り方:
 *  - PaymentIntent を「Connected Account のコンテキスト」で作成する
 *    （リクエストオプションに stripeAccount を渡す）。これにより charge / PaymentIntent は
 *    Connected Account 上に作られる＝直課金になる。
 *  - application_fee_amount に運営手数料を載せる。
 *  - payment_method_types は指定しない（動的決済手段。決済手段はダッシュボード側で制御）。
 */

/**
 * 店員さんの Connected Account に対する Direct charge の PaymentIntent を作成する。
 * 返り値の clientSecret をフロントの Stripe Elements に渡し、アプリ内で決済を確定してもらう。
 * 決済の確定はブラウザの戻り値ではなく Webhook を正とする（ここでは pending の PaymentIntent を作るだけ）。
 */
export async function createDirectChargePaymentIntent(
  params: CreateDirectChargeParams,
): Promise<DirectChargeResult> {
  const stripe = getStripe();

  // PaymentIntent を Connected Account のコンテキストで作成する（= Direct charge）。
  // payment_method_types は指定しない（動的決済手段を有効化し、Apple Pay / Google Pay / カードを自動提示）。
  // automatic_payment_methods で動的決済手段を明示的に有効化する（API 2023-08-16+ の既定だが明示する）。
  const intent = await stripe.paymentIntents.create(
    {
      // お客さま支払額（満額 + 上乗せ手数料）。JPY は最小単位＝1円のため整数をそのまま渡す
      amount: params.customerTotal,
      currency: params.currency,
      // 運営の取り分（application_fee）。これだけが運営に入り、満額は店員さんへ届く
      application_fee_amount: params.applicationFeeAmount,
      // 動的決済手段を有効化（payment_method_types は渡さない）
      automatic_payment_methods: { enabled: true },
      // 明細・サポート用の説明
      description: `${params.staffDisplayName} さんへのありがとう`,
      // Webhook で自前 tip を特定するための metadata（PaymentIntent 側に載せる）
      metadata: { tipId: params.tipId },
    },
    // ★ Connected Account のコンテキストで実行 ＝ Direct charge（課金先が店員さんの口座）
    { stripeAccount: params.connectedAccountId },
  );

  // client_secret が無い場合はフロントで決済 UI を初期化できないためエラーにする
  if (!intent.client_secret) {
    throw new Error("PaymentIntent の client_secret が取得できませんでした。");
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
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
 * Stripe Connect のオンボーディングリンク（本人確認・口座登録）を発行する（infrastructure 層）。
 *
 * 流れ:
 *  - まだ Connected Account を持っていなければ新規作成する（本人確認は後ろ倒し＝この時点では未確認でよい）。
 *    controller プロパティで責務を明示する（Accounts v2 の思想。legacy `type` は使わない）。
 *  - Account Link（account_onboarding）を発行し、店員さんを Stripe ホストの本人確認画面へ遷移させる。
 *
 * 完了の判定はこのリンクの戻りではなく、account.updated Webhook（payouts_enabled=true）を正とする。
 * 新規作成した場合は呼び出し元（Service）が staff.stripe_account_id に保存する。
 */
export async function createConnectOnboardingLink(
  params: CreateOnboardingLinkParams,
): Promise<CreateOnboardingLinkResult> {
  const stripe = getStripe();

  // 既存の Connected Account が無ければ作成する（本人確認は後ろ倒し。未確認でも作れる）
  let connectedAccountId = params.connectedAccountId;
  if (!connectedAccountId) {
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
      business_profile: { name: params.staffDisplayName },
    });
    connectedAccountId = account.id;
  }

  // オンボーディングリンク（account_onboarding）を発行する。
  // refresh_url はリンク期限切れ・中断時、return_url は手続き後に戻る先。
  const link = await stripe.accountLinks.create({
    account: connectedAccountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });

  return { onboardingUrl: link.url, connectedAccountId };
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
