import { getStripe } from "./stripe.client.js";
import type { Stripe } from "./stripe.client.js";
import type {
  CreateDirectChargeParams,
  DirectChargeResult,
  PaymentIntentStatusSnapshot,
  CreateOnboardingLinkParams,
  CreateOnboardingLinkResult,
  CreatePayoutParams,
  CreatePayoutResult,
  CreateConnectedAccountResult,
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
      // お客さま支払額＝額面（上乗せ廃止のため customer_total = amount）。JPY は最小単位＝1円のため整数をそのまま渡す
      amount: params.customerTotal,
      currency: params.currency,
      // 運営の取り分（application_fee ≈ 11.4% ＝ 15% − Stripe決済料3.6%）。
      // Direct charge では Stripe 料が店員側から引かれるため、これを 15% 丸ごとにせず差し引いた率にし、
      // 店員手取り約85%を成立させる
      application_fee_amount: params.applicationFeeAmount,
      // 動的決済手段を有効化（payment_method_types は渡さない）
      automatic_payment_methods: { enabled: true },
      // Link / Apple Pay / Google Pay は wallets ハッシュ側でしか除外できない（ここで excluded に
      // 入れると Stripe がエラーを返す）。そのため Link の抑制はフロントの PaymentElement の
      // wallets オプションで行う。ここでは link を含めない。
      // カード入力フォームをカードのみの最小構成に保つため、ウォレット以外の動的決済手段
      // （コンビニ・銀行振込等。日本アカウントで有効化され得る）はサーバー側で明示的に除外する。
      // 注: apple_pay / google_pay / link はここに入れてはならない（wallets ハッシュで制御）。
      excluded_payment_method_types: ["konbini", "customer_balance"],
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

  // 既存の Connected Account が無ければ作成する（本人確認は後ろ倒し。未確認でも作れる）。
  // プロフィール作成時の自動作成（createConnectedAccount）と同じ controller を使い、
  // 「受け取り（charges）は前倒し・送金（payouts）は本人確認後」を満たす（アカウントは人ごと1つで共通）。
  let connectedAccountId = params.connectedAccountId;
  if (!connectedAccountId) {
    const account = await stripe.accounts.create(buildConnectedAccountParams(params.staffDisplayName));
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
 * 送金（payout）を Connected Account 上で実行する（infrastructure 層・手動送金）。
 *
 * 設計上の肝（資金移動規制の回避）:
 *  - payout は「Connected Account のコンテキスト」で実行する（リクエストオプションに stripeAccount を渡す）。
 *    これにより Connected Account（店員さん）の残高から、登録済みの銀行口座へ直接振り込まれる。
 *    運営の残高を一度も経由しない（Direct charge で貯まった残高をそのまま銀行へ出す）。
 *  - Separate charges and transfers（運営が一旦受けて transfer する方式）は使わない。
 *  - 送金手数料は店員から取らない（amount はそのまま店員さんが受け取る額）。
 *
 * 着金確定はこの戻り値ではなく payout.paid / payout.failed Webhook を正とする
 * （ここでは payout を作成し、その ID を返すだけ）。
 */
export async function createPayout(params: CreatePayoutParams): Promise<CreatePayoutResult> {
  const stripe = getStripe();

  // payout を Connected Account のコンテキストで作成する（= 店員さんの残高→銀行）。
  // idempotencyKey に自前 payout 行の id を使い、再試行で同じ payout を二重作成しない（二重送金防止）。
  // metadata.payout_id に自前 payout 行の id を載せ、stripe_payout_id 更新前に落ちても
  // Webhook 側で payout 行を照合できるようにする（照合のバックアップ）。
  const payout = await stripe.payouts.create(
    {
      // 送金額（円）。JPY は最小単位＝1円のため整数をそのまま渡す
      amount: params.amount,
      currency: params.currency,
      // Webhook 照合のバックアップ（stripe_payout_id 未更新時に metadata で引けるように）
      metadata: { payout_id: params.payoutId },
    },
    // ★ Connected Account のコンテキストで実行（運営の残高を経由しない）。
    //   idempotencyKey で再試行時の二重 payout 作成を防ぐ。
    { stripeAccount: params.connectedAccountId, idempotencyKey: params.idempotencyKey },
  );

  return { payoutId: payout.id };
}

/**
 * Connected Account の作成パラメータ（controller・capabilities）を組み立てる。
 *
 * 設計上の肝（「受け取りは前倒し・送金は本人確認後」を Stripe の作法で満たす）:
 *  - `controller.requirement_collection: "application"`（要件収集は運営が担う）＋ `stripe_dashboard.type: "none"`。
 *    この組み合わせのときだけ、運営が API で本人情報・口座・利用規約同意を「代理投入（prefill）」でき、
 *    その結果 **card_payments / transfers capability が active になり charges_enabled=true** にできる
 *    （= 本人確認の前でも Direct charge を受けられる＝held で溜まる）。
 *    逆に requirement_collection: "stripe"（Stripe ホスト型オンボーディング）では運営が ToS を代理同意できず、
 *    ホスト画面を通すまで charges_enabled にならない。「体験を登録の前に」を満たすため application 側を選ぶ。
 *  - losses.payments / fees.payer は application（Direct charge の推奨。手数料は運営負担、負債は運営が引き受ける）。
 *  - これは「Connected Account の作り方」の controller 設定であり、Direct charge / application_fee の方針は変えない。
 *    送金（payouts_enabled）は本人確認（individual.verification.document 等）完了まで Stripe 側で保留される。
 */
function buildConnectedAccountParams(
  displayName: string,
): Stripe.AccountCreateParams {
  return {
    country: "JP",
    // controller で責務を明示（Accounts v2 の思想・legacy type は使わない）。
    // requirement_collection=application のとき dashboard は none 必須（Stripe の制約）。
    controller: {
      losses: { payments: "application" },
      fees: { payer: "application" },
      stripe_dashboard: { type: "none" },
      requirement_collection: "application",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: { name: displayName },
  };
}

/**
 * charges_enabled を満たすための「テスト用 prefill（本人情報・銀行口座・利用規約同意）」を組み立てる。
 *
 * Stripe の作法: requirement_collection=application の Connected Account に対し、運営が
 * card_payments capability の必須要件（business_profile / 代表者情報 / 銀行口座 / ToS 同意）を
 * 代理投入すると、テストモードでは即座に capability が active になり charges_enabled=true になる。
 * 値は Stripe のテスト用ダミー（実在しない固定値）。本番では本人がオンボーディングで入力する情報に置き換わる。
 *
 * 送金（payouts）に必要な本人確認書類（individual.verification.document）はここでは入れない。
 * これにより「受け取りは可能・送金は本人確認後」の分離が保たれる。
 */
function buildChargesEnabledPrefill(nowSeconds: number): Stripe.AccountUpdateParams {
  return {
    business_type: "individual",
    // 業種（飲食 5814）・URL・サービス説明（card_payments の必須要件）
    business_profile: {
      mcc: "5814",
      url: "https://arigato.jp",
      product_description: "接客スタッフへの投げ銭（ありがとう）の受け取り",
    },
    // 代表者（個人）情報。日本アカウントは漢字／カナ両方が必須。テスト用のダミー固定値を投入する。
    individual: {
      first_name: "太郎",
      last_name: "山田",
      first_name_kana: "タロウ",
      last_name_kana: "ヤマダ",
      first_name_kanji: "太郎",
      last_name_kanji: "山田",
      email: "staff@arigato.jp",
      phone: "+819012345678",
      dob: { day: 1, month: 1, year: 1990 },
      address_kana: {
        postal_code: "1500001",
        state: "トウキヨウト",
        city: "シブヤク",
        town: "ジングウマエ",
        line1: "1-1-1",
      },
      address_kanji: {
        postal_code: "1500001",
        state: "東京都",
        city: "渋谷区",
        town: "神宮前",
        line1: "1-1-1",
      },
    },
    // 銀行口座（Stripe テスト用の routing/account。日本は口座名義必須）。
    // 口座名義はカナ／英字のみ許可されるため、表示名（漢字を含み得る）ではなくカナの固定ダミーを使う。
    // これは charges_enabled を満たすためのテスト用 prefill であり、本番は本人がオンボーディングで入力する。
    external_account: {
      object: "bank_account",
      country: "JP",
      currency: "jpy",
      account_holder_name: "ヤマダ タロウ",
      routing_number: "1100000",
      account_number: "0001234",
    },
    // 利用規約への同意（requirement_collection=application のときだけ運営が代理同意できる）
    tos_acceptance: {
      date: nowSeconds,
      ip: "127.0.0.1",
    },
  };
}

/**
 * 店員さんの Connected Account を新規作成し、受け取り（Direct charge）を即可能にする（infrastructure 層）。
 *
 * プロフィール作成（POST /staff/me）時にコンポジションルートから呼ばれ、人ごとに1つだけ作る。
 * 「体験を登録の前に」を満たすため、本人確認の前でも投げ銭を受け取れる（held で溜まる）よう、
 * 作成直後に charges_enabled を満たす（capability を active にする）。送金は本人確認完了まで保留される。
 *
 * 流れ:
 *  1. controller（application 収集・dashboard none）＋ capabilities（card_payments / transfers）で作成。
 *  2. テスト用 prefill（本人情報・口座・ToS 同意）を投入し、charges_enabled を満たす。
 *  3. 万一まだ charges_enabled でなければ警告ログを残す（呼び出し元の判断材料）。
 */
export async function createConnectedAccount(
  displayName: string,
): Promise<CreateConnectedAccountResult> {
  const stripe = getStripe();

  // 1. Connected Account を作成（controller / capabilities を明示）
  const account = await stripe.accounts.create(buildConnectedAccountParams(displayName));

  // 2. charges_enabled を満たすためのテスト用 prefill を投入する
  const updated = await stripe.accounts.update(
    account.id,
    buildChargesEnabledPrefill(Math.floor(Date.now() / 1000)),
  );

  // 3. それでも charges_enabled でない場合は警告（テスト要件が変わった可能性。受け取りに失敗し得る）
  if (!updated.charges_enabled) {
    console.warn(
      `[stripe-connect] Connected Account ${account.id} は作成後も charges_enabled になりませんでした` +
        `（currently_due: ${JSON.stringify(updated.requirements?.currently_due ?? [])}）。`,
    );
  }

  return { connectedAccountId: account.id, chargesEnabled: updated.charges_enabled ?? false };
}
