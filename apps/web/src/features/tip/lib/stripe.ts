import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * tip feature の Stripe.js 初期化と Checkout 遷移（フロントの決済 UI 基盤）。
 *
 * カード情報は自前サーバーに通さない。お客さまは Stripe Checkout（ホスト型）へ遷移して
 * Stripe 上でカード / Apple Pay / Google Pay を入力する（PCI 負担を Stripe に寄せる）。
 *
 * Stripe.js は公開可能キー（VITE_STRIPE_PUBLISHABLE_KEY）で初期化する。
 * Direct charge の Checkout は Connected Account コンテキストで作られるため、フロントからの
 * リダイレクトはサーバーが返す Session の URL（checkoutUrl）へ直接遷移する方式を採る
 * （redirectToCheckout(sessionId) は Connect の口座コンテキストを要するため URL 遷移が確実）。
 */

// 公開可能キー（pk_test_... / pk_live_...）。ビルド時に Vite が埋め込む。実値はコミットしない。
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

// loadStripe は重いので一度だけ初期化してキャッシュする（複数回の決済でも再ロードしない）
let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Stripe.js のインスタンスを取得する（遅延初期化・シングルトン）。
 * 公開可能キーが未設定なら例外を投げる（誤って決済 UI を出さないための早期失敗）。
 */
export function getStripe(): Promise<Stripe | null> {
  if (!publishableKey) {
    throw new Error(
      "VITE_STRIPE_PUBLISHABLE_KEY が未設定です。フロントの決済 UI を初期化できません。",
    );
  }
  if (!stripePromise) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
}

/**
 * Stripe Checkout（ホスト型）へお客さまを遷移させる。
 * Stripe.js の初期化（=公開可能キーの妥当性確認）を済ませてから、サーバーが返した
 * Checkout Session の URL へリダイレクトする。カード情報は Stripe 側でのみ入力される。
 */
export async function redirectToStripeCheckout(checkoutUrl: string): Promise<void> {
  // Stripe.js を初期化（公開可能キー未設定ならここで失敗する）
  await getStripe();
  // ホスト型 Checkout の URL へ遷移（Direct charge の口座コンテキストを保持した URL）
  window.location.assign(checkoutUrl);
}
