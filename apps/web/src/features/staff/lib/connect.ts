import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";
import { createConnectAccountSession } from "../api/staff.api.js";

/**
 * staff feature の Connect Embedded Components 初期化（埋め込み型オンボーディングの基盤）。
 *
 * 本人確認・口座登録を Stripe ドメインへ全画面遷移させず、アプリ内に埋め込むための初期化を行う。
 * loadConnectAndInitialize({ publishableKey, fetchClientSecret }) で Connect インスタンスを生成し、
 * これを ConnectComponentsProvider に渡して ConnectAccountOnboarding を描画する。
 *
 * client_secret はバックの POST /staff/me/connect/account-session が発行する Account Session のもの。
 * 短命なため fetchClientSecret は毎回 API を叩いて取り直す（キャッシュしない）。
 *
 * Stripe.js（Connect）は公開可能キー（VITE_STRIPE_PUBLISHABLE_KEY）で初期化する。実値はコミットしない。
 */

// 公開可能キー（pk_test_... / pk_live_...）。ビルド時に Vite が埋め込む。実値はコミットしない。
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/**
 * 埋め込み型オンボーディング用の Connect インスタンスを初期化して返す。
 * 公開可能キーが未設定なら例外を投げる（誤って空の UI を出さないための早期失敗）。
 *
 * fetchClientSecret は Stripe が必要なタイミングで呼ぶコールバック。
 * Account Session を発行して client_secret を返す（短命なので毎回取り直す）。
 */
export function initConnectOnboarding(): StripeConnectInstance {
  if (!publishableKey) {
    throw new Error(
      "VITE_STRIPE_PUBLISHABLE_KEY が未設定です。埋め込み型オンボーディングを初期化できません。",
    );
  }

  // Connect インスタンスを初期化する。fetchClientSecret で Account Session の client_secret を供給する。
  return loadConnectAndInitialize({
    publishableKey,
    // Account Session を発行し、その client_secret を返す（Stripe が必要時に呼ぶ）
    fetchClientSecret: async () => {
      const session = await createConnectAccountSession();
      return session.clientSecret;
    },
  });
}
