import Stripe from "stripe";

/**
 * Stripe SDK のクライアント生成（infrastructure 層・外部 API の隔離点）。
 * feature 層からは直接 Stripe SDK を import せず、必ずこの infrastructure 経由で呼ぶ。
 *
 * 接続は遅延生成する。STRIPE_SECRET_KEY が未設定の環境でも import / 型チェック / 起動は通り、
 * 実際に Stripe を使ったときに初めて検証する（秘匿キーはコードに直書きせず env から読む）。
 */

let _stripe: Stripe | null = null;

// STRIPE_SECRET_KEY を読んで Stripe クライアントを初期化する（初回呼び出し時のみ）
function createStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // 秘匿キーが無い状態で Stripe を呼ぼうとしたら明示的に失敗させる
    throw new Error(
      "STRIPE_SECRET_KEY が未設定です。apps/api/.env.example を参考に sk_test_... を設定してください。",
    );
  }
  // API バージョンは SDK が固定する最新版（Stripe.API_VERSION）を使う。
  // 文字列を直書きせず SDK の定数に合わせることで、SDK と API のズレを防ぐ。
  return new Stripe(key, {
    apiVersion: Stripe.API_VERSION,
    appInfo: { name: "arigato", version: "0.1.0" },
  });
}

/**
 * Stripe クライアントの取得関数。
 * infrastructure 層の各ヘルパ（connect / webhook）はこれを呼んで Stripe を得る。
 * 最初の呼び出しまで接続を作らない（遅延生成）。
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = createStripe();
  }
  return _stripe;
}

// Stripe SDK の型を infrastructure 経由でだけ公開する（feature は SDK を直接 import しない）
export type { Stripe };
