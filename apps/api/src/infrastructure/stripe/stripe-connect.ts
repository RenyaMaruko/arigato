import { getStripe } from "./stripe.client.js";
import type { Stripe } from "./stripe.client.js";
import type {
  CreateDirectChargeParams,
  DirectChargeResult,
  PaymentIntentStatusSnapshot,
  CreateOnboardingLinkParams,
  CreateOnboardingLinkResult,
  CreateAccountSessionResult,
  CreatePayoutParams,
  CreatePayoutResult,
  CreateConnectedAccountResult,
  ConnectBalance,
  PendingBucket,
  ChargeSettlementSnapshot,
  PayoutLedgerEntry,
} from "./stripe.types.js";
import { CURRENCY } from "@arigato/shared";

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
 * WEB_BASE_URL（フロントのベース URL）から、決済手段ドメイン登録に使うホスト名を導出する純粋関数。
 *
 * Apple Pay / Google Pay のドメイン検証は「実在する https のドメイン」に対してしか成立しないため、
 * 以下のケースでは null を返し、呼び出し側は登録自体をスキップする:
 *  - 未設定・空文字（本番 URL が configure されていない環境）
 *  - URL として解釈できない文字列（scheme 無しの "localhost:5173" など）
 *  - localhost 系（localhost / *.localhost。ポート付き localhost:5173 も hostname は localhost なので同様にスキップ）
 *  - IP アドレス（127.0.0.1 等。Apple Pay のドメイン検証対象にならない）
 *
 * ホスト名のみ返す（URL のポートやパスは含めない。Stripe の domain_name はホスト名を要求する）。
 * DBアクセス・env 読み取りをしない純粋関数（Vitest の単体テスト対象）。
 */
export function deriveWalletDomain(webBaseUrl: string | undefined | null): string | null {
  // 未設定・空文字はスキップ（ローカル開発など本番 URL が無い環境）
  if (!webBaseUrl) return null;

  // URL として解釈できなければスキップ（"localhost:5173" のような scheme 無し文字列を含む）
  let url: URL;
  try {
    url = new URL(webBaseUrl);
  } catch {
    return null;
  }

  // hostname を取り出す（ポートは hostname に含まれないため自然に落ちる）
  const host = url.hostname.toLowerCase();
  if (!host) return null;

  // localhost 系はスキップ（ローカル開発では Apple Pay 自体が動かない・検証も通らない）
  if (host === "localhost" || host.endsWith(".localhost")) return null;

  // IP アドレス（IPv4 / IPv6 ループバック等）はスキップ（ドメイン検証の対象にならない）
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (host.includes(":") || host === "[::1]") return null;

  return host;
}

/**
 * 連結アカウントに「決済手段ドメイン」を登録する（infrastructure 層）。
 *
 * なぜ連結アカウント側に必要か:
 *  - Direct charge では PaymentIntent が連結アカウント上に作られるため、
 *    Apple Pay / Google Pay を表示できるかどうかの判定（ドメイン検証）も
 *    「連結アカウントに登録された payment_method_domains」に対して行われる。
 *  - プラットフォーム側にドメイン登録があっても、連結アカウント側に登録が無いと
 *    Express Checkout Element に Apple Pay ボタンが出ない（実機で確認済み）。
 *
 * そのため Stripe-Account ヘッダ（stripeAccount）付きでドメインを登録する。
 * 同一ドメインの再登録は Stripe 側で既存返却／再検証となるため冪等で安全。
 */
export async function registerPaymentMethodDomain(
  connectedAccountId: string,
  domainName: string,
): Promise<void> {
  const stripe = getStripe();

  // 連結アカウントのコンテキストでドメインを登録する（= その口座での Apple Pay 可否判定に効く）
  await stripe.paymentMethodDomains.create(
    { domain_name: domainName },
    { stripeAccount: connectedAccountId },
  );
}

/**
 * 連結アカウント作成直後に呼ぶ「決済手段ドメイン登録」の共通ヘルパ（非致命）。
 *
 * 連結アカウントを作る全経路（createConnectedAccount / createConnectOnboardingLink の
 * フォールバック作成）から呼び、今後作られる口座すべてで Apple Pay が出ない問題を塞ぐ。
 *
 * 方針:
 *  - ドメインは WEB_BASE_URL（env）から導出する。localhost / 未設定 / IP のときは登録しない
 *    （ローカル開発では Apple Pay 自体が動かないため）。
 *  - 登録失敗は非致命。アカウント作成自体は成立させ、console.error のログだけ残す
 *    （Apple Pay ボタンが出ないだけで、カード決済は問題なく可能なため）。
 *
 * webBaseUrl / register はテストのために注入可能にしている（既定は env と実 Stripe 呼び出し）。
 */
export async function registerWalletDomainSafely(
  connectedAccountId: string,
  webBaseUrl: string | undefined = process.env.WEB_BASE_URL,
  register: (
    connectedAccountId: string,
    domainName: string,
  ) => Promise<void> = registerPaymentMethodDomain,
): Promise<void> {
  // WEB_BASE_URL からホスト名を導出する。localhost / 未設定 / IP なら登録をスキップ
  const domainName = deriveWalletDomain(webBaseUrl);
  if (!domainName) return;

  try {
    // 連結アカウント側にドメインを登録する（Apple Pay / Google Pay の可否判定に必須）
    await register(connectedAccountId, domainName);
  } catch (error) {
    // 非致命: アカウント作成は成立させる（Apple Pay が出ないだけで決済自体は可能）。
    // 後追い対応（手動登録）ができるようログにアカウント ID とドメインを残す
    console.error(
      `[stripe-connect] 決済手段ドメイン登録に失敗しました（account: ${connectedAccountId}, domain: ${domainName}）。` +
        `Apple Pay / Google Pay が表示されない可能性があります。`,
      error,
    );
  }
}

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
      // 運営の取り分（application_fee = 額面の約15% ＝ 額面 − 店員手取り）。
      // 案B（fees.payer=application）では Stripe 決済料は運営が負担し application_fee から引かれる。
      // Direct charge では 連結残高 ＝ 額面 − application_fee なので、これで店員手取り85%（連結残高）が
      // DB手取り(floor(額面×0.85)) と1円もズレず一致する。運営の純取り分は Stripe 料を引いた約11.4%。
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
    // ★ Connected Account のコンテキストで実行 ＝ Direct charge（課金先が店員さんの口座）。
    //   idempotencyKey に自前 tip の ID を使い、リトライ・二重リクエストでも同一 tip に対する
    //   PaymentIntent を Stripe 側で二重作成しない（孤児 PaymentIntent の累積防止）。
    { stripeAccount: params.connectedAccountId, idempotencyKey: `tip-intent-${params.tipId}` },
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

    // 作成直後に決済手段ドメインを登録する（Apple Pay / Google Pay の可否は連結アカウント側で判定されるため）。
    // 失敗しても非致命（アカウント作成・オンボーディングは続行する）
    await registerWalletDomainSafely(connectedAccountId);
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
 * 埋め込み型オンボーディング（Connect Embedded Components）用の Account Session を発行する（infrastructure 層）。
 *
 * 全画面リダイレクト（Account Links）に代わり、アプリ内に Stripe の本人確認 UI を埋め込むための仕組み。
 * account_onboarding コンポーネントを有効にした Account Session を Connected Account 単位で発行し、
 * その client_secret をフロントの loadConnectAndInitialize({ fetchClientSecret }) に渡す。
 *
 * 設計上の肝:
 *  - Account Session は Connected Account（connectedAccountId）に対して発行する。
 *    controller 構成（requirement_collection: application / dashboard: none）の口座でも
 *    account_onboarding コンポーネントは利用できる（本人確認・口座登録を埋め込みで収集する）。
 *  - client_secret は短命（数分）。キャッシュせず、フロントが必要なたびに発行し直す。
 *  - 完了の判定はこの session の戻りではなく account.updated Webhook（payouts_enabled=true）を正とする
 *    （埋め込み UI の onExit は「画面を抜けた」だけ。確定は従来どおり Webhook）。
 */
export async function createAccountSession(
  connectedAccountId: string,
): Promise<CreateAccountSessionResult> {
  const stripe = getStripe();

  // account_onboarding コンポーネントを有効にした Account Session を発行する。
  // この session は対象の Connected Account に紐づき、フロントは client_secret で埋め込み UI を初期化する。
  //
  // disable_stripe_user_authentication: true で「Stripe のユーザー認証（電話番号認証の別ウィンドウ）」を無効化し、
  // 全画面ポップアップ無しで完全にアプリ内に埋め込む。これはプラットフォームが要件収集に責任を持つ構成
  // （controller.requirement_collection=application＝Custom相当）でのみ許可される設定。本人確認・審査は引き続き Stripe が担う。
  const session = await stripe.accountSessions.create({
    account: connectedAccountId,
    components: {
      account_onboarding: {
        enabled: true,
        features: { disable_stripe_user_authentication: true },
      },
    },
  });

  // client_secret が無い場合はフロントで埋め込み UI を初期化できないためエラーにする
  if (!session.client_secret) {
    throw new Error("Account Session の client_secret が取得できませんでした。");
  }

  return { clientSecret: session.client_secret };
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
 * Connected Account の「実残高」（送金可能 available・準備中 pending）を取得する（infrastructure 層）。
 *
 * 設計上の肝（#5 の対応＝残高不足の構造的回避）:
 *  - 送金可能額・送金額は DB の payable 合計ではなく、ここで取得する Stripe の実 available を「正」とする。
 *    受け取った資金は Stripe 内で数日 pending（確定待ち）→ available（送金可能）になるため、
 *    DB の権利（payable）と実際に払い出せる残高（Stripe settlement）は別物。available を超える送金はしない。
 *  - balance.retrieve を Connected Account のコンテキスト（stripeAccount）で呼び、その口座の残高を読む。
 *  - JPY（通貨は1つ）の available / pending を整数（円）で取り出す。
 *  - 準備中（pending）がある場合は、balance_transactions を auto-pagination で全件リスト取得し、
 *    available_on を暦日（Asia/Tokyo 基準）ごとにバケット集計する（pendingBuckets・日付昇順）。
 *    日付ごとにAPIを叩かないことでレート負荷を抑えつつ、100件超でも内訳を取りこぼさない。
 *    集計は net（手取り＝fee 控除後）ベースで行う。balance.pending 自体が net の合計であり、
 *    総額（amount）で集計するとバケット合計が pendingAmount と食い違ってしまうため。
 *    最も早い日付を nextAvailableOn（「◯月◯日から送金できます」）に使い、
 *    バケット合計は pendingAmount と必ず一致させる（差が出る場合は最早バケットへ寄せる）。
 *
 * 送金可能額の表示にも、送金実行時の上限再取得（TOCTOU 回避）にも使う。
 */
export async function retrieveConnectBalance(
  connectedAccountId: string,
): Promise<ConnectBalance> {
  const stripe = getStripe();

  // Connected Account のコンテキストで残高を取得する（その口座の available / pending を読む）
  const balance = await stripe.balance.retrieve({}, { stripeAccount: connectedAccountId });

  // JPY の available / pending を取り出す（通貨ごとの配列から jpy を合算。通常は1要素）。
  const availableAmount = sumBalanceForCurrency(balance.available, CURRENCY);
  const pendingAmount = sumBalanceForCurrency(balance.pending, CURRENCY);

  // 準備中（pending）があるときだけ balance_transactions を1回だけ取得し、暦日ごとに集計する。
  // pending が無ければ内訳・期日表示は不要（空配列／null）。
  let pendingBuckets: PendingBucket[] = [];
  let nextAvailableOn: string | null = null;
  if (pendingAmount > 0) {
    // balance_transactions を auto-pagination で全件走査する（100件超でも取りこぼさない）。
    // 日付ごとに API を叩かず1リスト（＋ページ送り）で済ませる＝レート負荷は従来どおり低い。
    const txns: PendingTransactionLike[] = [];
    for await (const txn of stripe.balanceTransactions.list(
      { limit: 100 },
      { stripeAccount: connectedAccountId },
    )) {
      txns.push({
        status: txn.status,
        currency: txn.currency,
        // net（手取り）を使う。balance.pending は net の合計なので、総額（amount）だと合わない
        net: txn.net,
        available_on: txn.available_on,
      });
    }
    // pending かつ available_on が未来のものを暦日（Asia/Tokyo）ごとに集計（純粋関数）。
    const buckets = groupPendingByAvailableDate(txns, Math.floor(Date.now() / 1000));
    // バケット合計が pendingAmount と必ず一致するよう、残差を最早バケットに寄せて整合させる。
    pendingBuckets = reconcilePendingBuckets(buckets, pendingAmount);
    // 最初（最早）のバケットの日付を nextAvailableOn とする（無ければ null）。
    nextAvailableOn = pendingBuckets[0]?.availableOn ?? null;
  }

  return { availableAmount, pendingAmount, nextAvailableOn, pendingBuckets };
}

// バケット集計が受け取る balance_transaction の最小形（純粋関数のテストを容易にするための型）。
export type PendingTransactionLike = {
  // balance_transaction の状態（pending: 確定待ち / available 等）
  status: string;
  // 通貨コード（jpy 以外は除外する）
  currency: string;
  // 手取り額（円・fee 控除後の net）。準備中の入金系は正の値。
  // balance.pending が net の合計なので、内訳集計も net で行う（総額 amount は使わない）
  net: number;
  // available になる予定の epoch 秒
  available_on: number;
};

/**
 * 準備中（pending）の balance_transactions を「available_on の暦日ごと（Asia/Tokyo 基準）」に
 * 合算して、日付昇順の内訳（pendingBuckets）を作る純粋関数。
 *
 * 仕様:
 *  - status=pending かつ available_on が未来（nowSeconds より後）かつ JPY のものだけを対象にする。
 *  - 金額は net（手取り＝fee 控除後）を合算する。balance.pending と同じベースに揃えるため。
 *  - 暦日は Asia/Tokyo（UTC+9）基準でまとめる（UI が「M月D日」で表示するため）。
 *  - 同じ暦日のものは合算し、availableOn はその日の 0:00（JST）を ISO 文字列で表す。
 *  - 日付昇順で返す。対象が無ければ空配列。
 *
 * DBアクセスしない純粋関数（Vitest の単体テスト対象）。
 */
export function groupPendingByAvailableDate(
  transactions: PendingTransactionLike[],
  nowSeconds: number,
): PendingBucket[] {
  // 暦日（JST）の 0:00 を表す epoch 秒 → その日の合計額（円）
  const byDay = new Map<number, number>();

  for (const txn of transactions) {
    // pending かつ JPY かつ available_on が未来のものだけを対象にする
    if (txn.status !== "pending") continue;
    if (txn.currency !== CURRENCY) continue;
    if (txn.available_on <= nowSeconds) continue;

    // available_on（epoch 秒）を JST の暦日の 0:00（epoch 秒）に丸め、手取り（net）を合算する
    const dayStartSeconds = toJstDayStartSeconds(txn.available_on);
    byDay.set(dayStartSeconds, (byDay.get(dayStartSeconds) ?? 0) + txn.net);
  }

  // 日付昇順に並べ、各日の 0:00（JST）を ISO 文字列にして返す
  return Array.from(byDay.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([dayStartSeconds, amount]) => ({
      availableOn: new Date(dayStartSeconds * 1000).toISOString(),
      amount,
    }));
}

/**
 * epoch 秒（UTC）を Asia/Tokyo（UTC+9・DST 無し）の「その暦日の 0:00」に丸めて epoch 秒で返す。
 * 日本はサマータイムが無いため固定オフセット +9h で安全に暦日を判定できる。
 */
function toJstDayStartSeconds(epochSeconds: number): number {
  const JST_OFFSET_SECONDS = 9 * 60 * 60;
  const DAY_SECONDS = 24 * 60 * 60;
  // JST のローカル秒に直してから日単位で切り捨て、再び UTC epoch へ戻す
  const jstLocal = epochSeconds + JST_OFFSET_SECONDS;
  const jstDayStartLocal = Math.floor(jstLocal / DAY_SECONDS) * DAY_SECONDS;
  return jstDayStartLocal - JST_OFFSET_SECONDS;
}

/**
 * バケット合計を pendingAmount（Stripe の pending 合計）に必ず一致させる純粋関数。
 *
 * balance_transactions は auto-pagination で全件走査するため通常は一致するが、
 * 取得タイミングのズレ等でバケット合計が pendingAmount を下回り得る（保険）。
 * その場合は残差（pendingAmount − バケット合計）を
 * 最も早いバケットに寄せて、合計を pendingAmount に揃える（整合性の担保）。
 *  - バケットが空なのに pendingAmount>0 のときは、日付不明の合算1件として扱えるよう空配列を返し、
 *    呼び出し側（service / UI）が pendingStripeAmount の保険表示にフォールバックできるようにする。
 */
export function reconcilePendingBuckets(
  buckets: PendingBucket[],
  pendingAmount: number,
): PendingBucket[] {
  // バケットが無ければ寄せ先が無い（UI 側の保険表示に任せる）
  if (buckets.length === 0) return buckets;

  const bucketTotal = buckets.reduce((sum, b) => sum + b.amount, 0);
  const diff = pendingAmount - bucketTotal;
  // 差が無ければそのまま（既に一致）
  if (diff === 0) return buckets;

  // 残差を最早バケット（先頭）に寄せて合計を pendingAmount に揃える。
  // 寄せた結果が負にならないよう 0 で下限を取る（返金等で pendingAmount が小さいケースの保険）。
  return buckets.map((b, i) =>
    i === 0 ? { ...b, amount: Math.max(0, b.amount + diff) } : { ...b },
  );
}

/**
 * (e) 日次照合バッチ用: Connected Account で「成立した payout（status=paid）の合計額」を取得する（infrastructure 層）。
 *
 * DB の paid な tip 手取り合計と、Stripe 側の成立 payout 合計を「合計レベル」で突き合わせるために使う
 * （全件スキャンしない・合計だけ照合し、ズレた口座だけ後で掘り下げる）。
 * payout は Connected Account 上にあるため stripeAccount を指定して読み、auto-pagination で全件合算する。
 */
export async function sumPaidPayouts(connectedAccountId: string): Promise<number> {
  const stripe = getStripe();
  let total = 0;
  // status=paid の payout を auto-pagination で全件走査し、JPY の額を合算する
  for await (const po of stripe.payouts.list(
    { status: "paid", limit: 100 },
    { stripeAccount: connectedAccountId },
  )) {
    if (po.currency === CURRENCY) {
      total += po.amount;
    }
  }
  return total;
}

/**
 * (c) charge を expand して balance_transaction（確定見込み）を取得する（infrastructure 層）。
 *
 * 設計の肝（Stripe を残高の真実の源泉とし、自前は「鏡」を持つ）:
 *  - charge.balance_transaction（available_on / status）を取得し、tip に保存する見込み情報を返す。
 *  - Direct charge の charge は Connected Account 上にあるため、stripeAccount を指定して読む。
 *  - PI 直後は balance_transaction が未付与のことがある（堅牢に）。取れない項目は null で返し、
 *    呼び出し側は後続イベント（charge.updated など）で埋め直せるようにする。
 *
 * 用途: UI 表示（「◯日後に送金できます」を tip 単位で正確化）・送金候補の事前フィルタ。
 *   送金可否の最終判定は必ず送金直前の balance.retrieve（実 available）で行う（これは予測・並べ替え用）。
 */
export async function retrieveChargeSettlement(
  chargeId: string,
  connectedAccountId: string,
): Promise<ChargeSettlementSnapshot> {
  const stripe = getStripe();

  // charge を取得し balance_transaction を expand する（Connected Account のコンテキストで読む）
  const charge = await stripe.charges.retrieve(
    chargeId,
    { expand: ["balance_transaction"] },
    { stripeAccount: connectedAccountId },
  );

  // balance_transaction が未付与（string ID のみ／null）の場合は available_on / status を取れない。
  // その場合でも charge ID は返し、見込み情報は null（後続イベントで埋める）。
  const bt = charge.balance_transaction;
  if (bt == null || typeof bt === "string") {
    // string ID だけ取れた場合は ID は記録する（available_on/status は後続で埋める）
    return {
      chargeId: charge.id,
      balanceTransactionId: typeof bt === "string" ? bt : null,
      availableOn: null,
      btStatus: null,
    };
  }

  // 展開済み balance_transaction から確定見込みを取り出す
  return {
    chargeId: charge.id,
    balanceTransactionId: bt.id,
    // available_on は秒単位の epoch。送金可能になる見込み時刻として記録する
    availableOn: bt.available_on ? new Date(bt.available_on * 1000) : null,
    // status は pending（確定待ち）/ available（送金可能）。それ以外は null 扱い
    btStatus: bt.status === "available" ? "available" : bt.status === "pending" ? "pending" : null,
  };
}

/**
 * (d) ある payout の内訳（balance_transactions?payout=po_…）を auto-pagination で全件取得する（infrastructure 層）。
 *
 * 設計の肝（手動送金は Stripe が自動照合しないため、この台帳が唯一の突き合わせ手段＝公式明記）:
 *  - balance_transactions を payout フィルタで列挙し、各エントリの source(ch_…) を取り出す。
 *    これにより「payout ⇄ balance_transaction ⇄ charge(tip)」の対応を台帳へ追記できる。
 *  - Direct charge の payout は Connected Account 上にあるため、stripeAccount を指定して読む。
 *  - autoPagingEach（auto-pagination）で 100 件超の内訳も漏れなく取得する。
 */
export async function listPayoutLedgerEntries(
  stripePayoutId: string,
  connectedAccountId: string,
): Promise<PayoutLedgerEntry[]> {
  const stripe = getStripe();
  const entries: PayoutLedgerEntry[] = [];

  // payout に含まれる balance_transaction を auto-pagination で全件走査する
  for await (const txn of stripe.balanceTransactions.list(
    { payout: stripePayoutId, limit: 100 },
    { stripeAccount: connectedAccountId },
  )) {
    // source が charge（ch_…）なら charge ID を逆引きできる（それ以外＝payout 自身などは null）
    const chargeId = extractSourceChargeId(txn.source);
    entries.push({
      balanceTransactionId: txn.id,
      type: txn.type,
      amount: txn.amount,
      chargeId,
    });
  }

  return entries;
}

/**
 * balance_transaction.source（string | 展開オブジェクト | null）から charge ID（ch_…）を取り出す純粋ヘルパ。
 * source が ch_ で始まる文字列のときだけ charge とみなす（payout/refund 等は null を返す）。
 */
function extractSourceChargeId(
  source: Stripe.BalanceTransaction["source"],
): string | null {
  if (source == null) return null;
  const id = typeof source === "string" ? source : source.id;
  if (typeof id !== "string") return null;
  return id.startsWith("ch_") ? id : null;
}

/**
 * 残高（available / pending）の配列から、指定通貨の金額合計（円）を取り出す純粋ヘルパ。
 * Stripe は通貨ごとに要素を分けるため、対象通貨のものだけを合算する（JPY は通常1要素）。
 */
function sumBalanceForCurrency(
  funds: Array<{ amount: number; currency: string }>,
  currency: string,
): number {
  return funds
    .filter((f) => f.currency === currency)
    .reduce((sum, f) => sum + f.amount, 0);
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
 *  - losses.payments / fees.payer はともに application。
 *    requirement_collection=application ＋ dashboard none の構成では、Stripe の制約により
 *    運営（application）が losses と fees の両方を持つ必要があり、fees.payer=account は選べない
 *    （実Stripeで「the Connect application must also control losses, fees, and specify a dashboard type of none.」を確認）。
 *    したがって Stripe 処理手数料は運営が負担し、料率の整合は application_fee 率を 15% にすることで取る（案B）。
 *    額面 − application_fee(15%) ＝ 店員手取り85% が連結アカウント残高として残り（Stripe料は運営の application_fee から差し引かれる）、
 *    DB の手取り(floor(額面×0.85)) と一致する。
 *  - これは「Connected Account の作り方」の controller 設定であり、Direct charge / application_fee の方針は変えない。
 *    送金（payouts_enabled）は本人確認（individual.verification.document 等）完了まで Stripe 側で保留される。
 */
function buildConnectedAccountParams(
  displayName: string,
): Stripe.AccountCreateParams {
  // Apple Pay のドメイン検証は「アカウントにビジネス URL があること」が前提
  // （無いと payment_method_domains 登録時に apple_pay が inactive のまま:
  //   "you must provide a business URL for this account" を実 Stripe で確認）。
  // そのため作成時点で WEB_BASE_URL 由来の URL（投げ銭ページが動く実ドメイン）を設定する。
  // localhost / 未設定のときは URL を付けない（ドメイン登録自体もスキップされる）
  const walletDomain = deriveWalletDomain(process.env.WEB_BASE_URL);

  return {
    country: "JP",
    // controller で責務を明示（Accounts v2 の思想・legacy type は使わない）。
    // requirement_collection=application のとき dashboard は none 必須（Stripe の制約）。
    controller: {
      losses: { payments: "application" },
      // Stripe 処理手数料は運営（application）が負担する。
      // requirement_collection=application ＋ dashboard none の構成では、Stripe の制約により
      // 運営が losses・fees の両方を持ち dashboard=none を指定しなければならない
      // （fees.payer=account は同構成では不可：「When controlling requirement collection,
      //   the Connect application must also control losses, fees, and specify a dashboard type of none.」）。
      // そのため fees.payer は application のまま据え置き、料率の整合は application_fee 率（=15%）で取る（案B）。
      fees: { payer: "application" },
      stripe_dashboard: { type: "none" },
      requirement_collection: "application",
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: displayName,
      // Apple Pay 有効化の前提となるビジネス URL（公開ドメインがあるときだけ設定）
      ...(walletDomain ? { url: `https://${walletDomain}` } : {}),
    },
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
 *  1.5. 決済手段ドメインを連結アカウント側に登録する（Apple Pay / Google Pay の表示に必須・非致命）。
 *  2. テスト用 prefill（本人情報・口座・ToS 同意）を投入し、charges_enabled を満たす。
 *  3. 万一まだ charges_enabled でなければ警告ログを残す（呼び出し元の判断材料）。
 */
export async function createConnectedAccount(
  displayName: string,
): Promise<CreateConnectedAccountResult> {
  const stripe = getStripe();

  // 1. Connected Account を作成（controller / capabilities を明示）
  const account = await stripe.accounts.create(buildConnectedAccountParams(displayName));

  // 1.5. 作成直後に決済手段ドメインを登録する。
  //    Direct charge では Apple Pay / Google Pay の可否が「連結アカウント側」のドメイン登録で
  //    判定されるため、プラットフォーム登録だけでは Apple Pay ボタンが出ない（実機で確認済み）。
  //    失敗しても非致命（アカウント作成は成立させる。決済自体はカードで可能）
  await registerWalletDomainSafely(account.id);

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
