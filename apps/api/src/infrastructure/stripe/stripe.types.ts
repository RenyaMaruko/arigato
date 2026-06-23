/**
 * Stripe infrastructure 層が feature へ公開する型。
 * feature 層は Stripe SDK の型に直接依存せず、この infrastructure 型を介して受け渡しする
 * （外部 API の隔離。SDK 差し替え時の影響範囲を infrastructure 内に閉じる）。
 */

// Direct charge の PaymentIntent を作るときに infrastructure が受け取るパラメータ
export type CreateDirectChargeParams = {
  // 課金先となる店員さんの Connected Account（Direct charge の課金先）
  connectedAccountId: string;
  // 店員さんに届く満額（円）。お客さま支払額に含まれる
  amount: number;
  // 運営の取り分（application_fee・円）。運営はこの手数料だけを受領する
  applicationFeeAmount: number;
  // お客さま支払額（満額 + 上乗せ手数料・円）。PaymentIntent の請求総額（amount）
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
