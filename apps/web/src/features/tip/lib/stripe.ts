import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * tip feature の Stripe.js 初期化（フロントの決済 UI 基盤）。
 *
 * カード情報は自前サーバーに通さない。アプリ内に埋め込んだ Stripe Elements
 * （Express Checkout Element ＋ Payment Element）で決済を確定する（リダイレクト型 Checkout は使わない）。
 *
 * Direct charge の PaymentIntent は店員さんの Connected Account 上にあるため、Stripe.js は
 * その口座コンテキスト（stripeAccount）を指定して初期化する必要がある。口座ごとに
 * Stripe インスタンスをキャッシュして、同じ口座への複数回の決済で再ロードしない。
 *
 * Stripe.js は公開可能キー（VITE_STRIPE_PUBLISHABLE_KEY）で初期化する。
 */

// 公開可能キー（pk_test_... / pk_live_...）。ビルド時に Vite が埋め込む。実値はコミットしない。
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

// 口座コンテキスト（connectedAccountId）ごとに Stripe インスタンスをキャッシュする
const stripeByAccount = new Map<string, Promise<Stripe | null>>();

/**
 * Direct charge の Connected Account コンテキストで Stripe.js を取得する（遅延初期化・口座別キャッシュ）。
 * 公開可能キーが未設定なら例外を投げる（誤って決済 UI を出さないための早期失敗）。
 *
 * connectedAccountId は PaymentIntent を作成した課金先口座。これを stripeAccount に渡すことで、
 * その口座の client_secret に対して Elements / confirmPayment が正しく動作する。
 */
export function getConnectedStripe(connectedAccountId: string): Promise<Stripe | null> {
  if (!publishableKey) {
    throw new Error(
      "VITE_STRIPE_PUBLISHABLE_KEY が未設定です。フロントの決済 UI を初期化できません。",
    );
  }
  // 口座ごとに一度だけ初期化する
  const cached = stripeByAccount.get(connectedAccountId);
  if (cached) return cached;
  // Connected Account コンテキストで Stripe.js をロード（Direct charge の口座を指定）
  const promise = loadStripe(publishableKey, { stripeAccount: connectedAccountId });
  stripeByAccount.set(connectedAccountId, promise);
  return promise;
}
