import { createClient, type Session } from "@supabase/supabase-js";

/**
 * Supabase Auth クライアントとログイン処理（フロントの認証集約）。
 * 発行は Supabase。メール（マジックリンク/パスワード）と Google でのサインイン・サインアップに対応する。
 * バックへは Supabase が発行した access token（JWT）を Authorization: Bearer で送り、
 * バックは JWKS で検証する（共有 Secret は使わない）。
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

// Supabase クライアント（セッションは localStorage に永続化し、ページ再読込でログインを保つ）
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * 現在のセッションの access token（JWT）を取得する。
 * 未ログインなら null。API クライアントが Authorization ヘッダに使う。
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * 現在のセッションを取得する（未ログインなら null）。
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * メールアドレスでサインイン/サインアップ（マジックリンク）。
 * 既存・新規を問わずワンタイムリンクで認証する（パスワードを自前で持たない方針）。
 */
export async function signInWithEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // 認証後に戻ってくる先（ログイン後の起点）。招待コードがあれば付与する。
      emailRedirectTo: `${window.location.origin}/staff`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * Google でサインイン/サインアップ（OAuth リダイレクト）。
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/staff`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * 店アカウント向け: メールアドレスでサインイン/サインアップ（マジックリンク）。
 * 認証後の戻り先を店入口（/store）にする点だけが店員さん向けと異なる。
 */
export async function signInWithEmailForStore(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/store`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * 店アカウント向け: Google でサインイン/サインアップ（OAuth リダイレクト）。
 * 認証後の戻り先を店入口（/store）にする。
 */
export async function signInWithGoogleForStore(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/store`,
    },
  });
  if (error) {
    throw error;
  }
}

/**
 * サインアウトする。
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
