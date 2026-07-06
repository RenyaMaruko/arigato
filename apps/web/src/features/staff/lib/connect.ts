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
    // 埋め込みUIの見た目をアプリのデザイントークン（design-tokens.md / tailwind.config）に寄せる。
    // 色・フォント・角丸を合わせ、Stripe画面がアプリに馴染むようにする（構造はStripeが描画）。
    appearance: {
      variables: {
        // フォント（アプリ本文と同じ Noto Sans JP）
        fontFamily: '"Noto Sans JP", sans-serif',
        // 基本色（rose=アクセント / ink=本文 / page=背景 / line=罫線）
        colorPrimary: "#ec3a6d",
        colorText: "#1f2024",
        colorBackground: "#ffffff",
        colorBorder: "#e6e7ea",
        // 主ボタンをアプリの rose 塗りボタンと同じトーンに
        buttonPrimaryColorBackground: "#ec3a6d",
        buttonPrimaryColorBorder: "#ec3a6d",
        buttonPrimaryColorText: "#ffffff",
        // リンク・アクション文字も rose に
        actionPrimaryColorText: "#ec3a6d",
        // フォームのアクセント（チェック・ラジオ等）
        formAccentColor: "#ec3a6d",
        // 角丸（アプリの rounded-xl=14px に合わせる。フォームは少し控えめ）
        buttonBorderRadius: "14px",
        formBorderRadius: "12px",
        borderRadius: "12px",
      },
    },
  });
}
