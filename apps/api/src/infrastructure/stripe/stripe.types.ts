/**
 * Stripe infrastructure 層が feature へ公開する型。
 * feature 層は Stripe SDK の型に直接依存せず、この infrastructure 型を介して受け渡しする
 * （外部 API の隔離。SDK 差し替え時の影響範囲を infrastructure 内に閉じる）。
 */

// Direct charge の決済セッションを作るときに infrastructure が受け取るパラメータ
export type CreateDirectChargeParams = {
  // 課金先となる店員さんの Connected Account（Direct charge の課金先）
  connectedAccountId: string;
  // 店員さんに届く満額（円）。決済の商品金額そのもの＝お客さま支払額に含む
  amount: number;
  // 運営の取り分（application_fee・円）。運営はこの手数料だけを受領する
  applicationFeeAmount: number;
  // お客さま支払額（満額 + 上乗せ手数料・円）。Checkout に提示する請求総額
  customerTotal: number;
  // 通貨コード（jpy）
  currency: string;
  // 表示用の店員さん名（Checkout の品目名に使う）
  staffDisplayName: string;
  // 決済完了後にお客さまを戻すフロントの完了 URL
  successUrl: string;
  // 決済を中断したときにお客さまを戻すフロントの URL
  cancelUrl: string;
  // 紐づける自前 tip の ID（Webhook で tip を特定するための metadata）
  tipId: string;
};

// Direct charge セッション作成の結果（feature 側はこれを受け取って tip を記録・返却する）
export type DirectChargeResult = {
  // お客さまをリダイレクトする Stripe Checkout の URL（カード情報は自前 API に通さない）
  checkoutUrl: string;
  // 生成された PaymentIntent の ID。ホスト型 Checkout では支払い時に作られるため作成直後は null のことがある。
  // その場合は Webhook の PaymentIntent metadata.tipId で tip を突合する。
  paymentIntentId: string | null;
  // 生成された Checkout Session の ID（tip に保存し、突合ジョブ・Webhook で参照する）
  checkoutSessionId: string;
};

// Webhook 署名検証を通過したイベントのうち、Service が必要とする最小情報
export type VerifiedWebhookEvent = {
  // Stripe のイベント ID（冪等性キー。webhook_event に記録する）
  id: string;
  // イベント種別（payment_intent.succeeded など）
  type: string;
  // 対象 PaymentIntent の ID（tip との突合に使う。該当しないイベントは null）
  paymentIntentId: string | null;
  // PaymentIntent の metadata に載せた tip ID（あれば tip 特定に優先利用）
  tipId: string | null;
};

// 突合ジョブが Stripe へ問い合わせて得る PaymentIntent の状態（DB の tip と突合する）
export type PaymentIntentStatusSnapshot = {
  paymentIntentId: string;
  // Stripe 側のステータス（succeeded / canceled / requires_payment_method など）
  status: string;
};
