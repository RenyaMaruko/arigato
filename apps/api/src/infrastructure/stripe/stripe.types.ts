/**
 * Stripe infrastructure 層が feature へ公開する型。
 * feature 層は Stripe SDK の型に直接依存せず、この infrastructure 型を介して受け渡しする
 * （外部 API の隔離。SDK 差し替え時の影響範囲を infrastructure 内に閉じる）。
 */

// Direct charge の PaymentIntent を作るときに infrastructure が受け取るパラメータ
export type CreateDirectChargeParams = {
  // 課金先となる店員さんの Connected Account（Direct charge の課金先）
  connectedAccountId: string;
  // 投げ銭の額面（円）。お客さま支払額そのもの（手取り型のため上乗せなし）
  amount: number;
  // 運営の取り分（application_fee = 額面の約15% ＝ 額面 − 店員手取り・円）。fees.payer=application のため Stripe 料はここから引かれ運営純額は約11.4%
  applicationFeeAmount: number;
  // お客さま支払額（額面・円。上乗せ廃止のため = amount）。PaymentIntent の請求総額（amount）
  customerTotal: number;
  // 通貨コード（jpy）
  currency: string;
  // 表示用の店員さん名（PaymentIntent の説明に使う）
  staffDisplayName: string;
  // 紐づける自前 tip の ID（Webhook で tip を特定するための metadata）
  tipId: string;
};

// Direct charge の PaymentIntent 作成結果（feature 側はこれを受け取って tip を記録・返却する）
export type DirectChargeResult = {
  // フロントの Stripe Elements（Express Checkout / Payment Element）に渡す client_secret。
  // これでアプリ内に決済 UI を埋め込み、カード情報を自前サーバーに通さずに決済を確定する。
  clientSecret: string;
  // 生成された PaymentIntent の ID（tip に保存し、突合ジョブ・Webhook で参照する）。
  // PaymentIntent 方式では作成時点で必ず ID が確定する。
  paymentIntentId: string;
};

// Webhook 署名検証を通過したイベントのうち、Service が必要とする最小情報
export type VerifiedWebhookEvent = {
  // Stripe のイベント ID（冪等性キー。webhook_event に記録する）
  id: string;
  // イベント種別（payment_intent.succeeded / account.updated など）
  type: string;
  // 対象 PaymentIntent の ID（tip との突合に使う。該当しないイベントは null）
  paymentIntentId: string | null;
  // PaymentIntent の metadata に載せた tip ID（あれば tip 特定に優先利用）
  tipId: string | null;
  // account.updated 系の Connected Account ID（該当しないイベントは null）
  accountId: string | null;
  // Connected Account の payouts_enabled（着金可否の起点。account.updated 以外は null）
  payoutsEnabled: boolean | null;
  // payout.* 系の Stripe Payout ID（該当しないイベントは null。送金の着金/失敗の照合に使う）
  payoutId: string | null;
  // payout.* の metadata.payout_id（自前 payout 行の id。stripe_payout_id 未更新時の照合バックアップ。対象外は null）
  payoutMetadataId: string | null;
  // payout.* の着金日時（payout.paid の arrival_date から。未設定・対象外は null）
  payoutArrivedAt: Date | null;
  // payout.failed の失敗理由（failure_message。対象外は null）
  payoutFailureReason: string | null;
  // (c) charge.* / payment_intent.succeeded で受け取る charge ID（ch_…）。確定見込み（balance_transaction）の取得元。対象外は null
  chargeId: string | null;
  // (c) charge に紐づく Connected Account ID（Direct charge は Connected Account 上で発生。
  //   account.updated 系の accountId とは別経路。balance_transaction 取得時の stripeAccount に使う）。対象外は null
  chargeConnectedAccountId: string | null;
  // (f) 返金・チャージバックの種別（refunded: 返金 / disputed: 異議。対象外は null）。
  //   tip を refunded / disputed へ遷移させ、残高・受取履歴・送金候補から除外する
  settlementCorrection: "refunded" | "disputed" | null;
};

// Connect オンボーディングリンク発行の入力（infrastructure が受け取るパラメータ）
export type CreateOnboardingLinkParams = {
  // 既存の Connected Account ID（未連携は null。null のときは新規作成する）
  connectedAccountId: string | null;
  // 表示用の店員さん名（新規アカウント作成時のビジネス名に使う）
  staffDisplayName: string;
  // オンボーディング完了後に戻すフロントの URL
  returnUrl: string;
  // オンボーディング中断・期限切れ時にやり直すフロントの URL
  refreshUrl: string;
};

// Connect オンボーディングリンク発行の結果
export type CreateOnboardingLinkResult = {
  // 店員さんを遷移させるオンボーディングリンク（本人確認・口座登録の Stripe ホスト画面）
  onboardingUrl: string;
  // 使用した Connected Account ID（新規作成した場合は staff に保存する）
  connectedAccountId: string;
};

// 突合ジョブが Stripe へ問い合わせて得る PaymentIntent の状態（DB の tip と突合する）
export type PaymentIntentStatusSnapshot = {
  paymentIntentId: string;
  // Stripe 側のステータス（succeeded / canceled / requires_payment_method など）
  status: string;
};

// 送金（payout）を Connected Account 上で実行するときに infrastructure が受け取るパラメータ
export type CreatePayoutParams = {
  // 送金元の Connected Account（この口座の残高から銀行へ payout する）
  connectedAccountId: string;
  // 送金額（店員さんが銀行で受け取る額・円）。JPY は最小単位＝1円のため整数をそのまま渡す
  amount: number;
  // 通貨コード（jpy）
  currency: string;
  // 冪等キー（自前 payout 行の id を使う）。再試行で同じ payout を二重作成しない（二重送金防止）
  idempotencyKey: string;
  // 自前 payout 行の id。Stripe payout の metadata に載せ、Webhook 照合のバックアップにする
  payoutId: string;
};

// 送金（payout）実行の結果（feature 側はこれを受け取って payout を記録する）
export type CreatePayoutResult = {
  // 生成された Stripe Payout の ID（payout 行に保存し、payout.* Webhook で照合する）
  payoutId: string;
};

// 連結アカウント作成の結果（プロフィール作成時に staff へ保存する）
export type CreateConnectedAccountResult = {
  // 作成した Connected Account の ID（staff.stripe_account_id に保存・人ごと1つ）
  connectedAccountId: string;
  // 受け取り（Direct charge）が可能か（true なら本人確認前でも held で受け取れる）
  chargesEnabled: boolean;
};

// (c) charge の balance_transaction から取得する「確定見込み」スナップショット。
//   PI 直後は balance_transaction が未付与のことがあるため、取得できない項目は null で返す（後続イベントで埋める）。
export type ChargeSettlementSnapshot = {
  // charge ID（ch_…）。tip.stripe_charge_id に保存し、返金・チャージバックの逆引きにも使う
  chargeId: string;
  // balance_transaction ID（txn_…）。payout 内訳との突合（台帳 d）に使う。未付与なら null
  balanceTransactionId: string | null;
  // 送金可能（available）になる見込み時刻（pending→available の確定見込み）。未付与なら null
  availableOn: Date | null;
  // balance_transaction の状態（pending: 確定待ち / available: 送金可能）。未付与なら null
  btStatus: "pending" | "available" | null;
};

// (d) payout 内訳の1要素（balance_transactions?payout=po_… の auto-pagination 結果の1行）。
//   payout ⇄ balance_transaction ⇄ charge(tip) の対応を台帳へ追記するための素材。
export type PayoutLedgerEntry = {
  // balance_transaction ID（txn_…）
  balanceTransactionId: string;
  // balance_transaction の種別（charge / payout / refund / adjustment / payment_refund など）
  type: string;
  // 金額（円。Stripe の net ではなく amount をそのまま。payout はマイナス側になる）
  amount: number;
  // source が charge（ch_…）なら charge ID。payout 自身や非 charge は null
  chargeId: string | null;
};

// Connected Account の残高スナップショット（送金可能額・準備中額の「正」＝ Stripe 実残高）。
// DB の payable 合計ではなく、この available を送金可能額の正とする（残高不足の構造的回避）。
// 金額は JPY の最小単位＝1円のため整数（円）でそのまま扱う。
export type ConnectBalance = {
  // 送金可能（available）残高（円）。「送金する」の対象額・payout の上限となる
  availableAmount: number;
  // 準備中（pending・Stripe 確定待ち）残高（円）。available になるまで送金できない
  pendingAmount: number;
  // 準備中の資金が最も早く available になる日時（ISO 文字列・「◯月◯日から送金できます」表示用）。
  // pending が無い／available_on を拾えない場合は null
  nextAvailableOn: string | null;
};
