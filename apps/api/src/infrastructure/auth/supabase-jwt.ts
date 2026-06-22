import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Supabase JWT の検証（infrastructure・外部依存の隔離）。
 * トークンの発行は Supabase、バックは送られた JWT を「検証するだけ」。
 *
 * 検証方式は JWKS（非対称鍵）。共有 JWT Secret は使わず、
 * `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` の公開鍵で署名を検証する。
 * jose の createRemoteJWKSet が鍵の取得・キャッシュ・ローテーション追従を担う。
 */

// 検証済みユーザーの最小情報（バックが扱うのは sub=auth_user_id とメールのみ）
export type AuthUser = {
  // Supabase auth.users の UUID（staff.auth_user_id に対応）
  id: string;
  email: string | null;
};

// JWKS の RemoteKeySet を遅延生成してプロセス内でキャッシュする（鍵取得を毎回しない）
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

// SUPABASE_URL から JWKS エンドポイントの RemoteKeySet を組み立てる
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (_jwks) return _jwks;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL が未設定です。JWKS で JWT を検証できません。");
  }
  // 末尾スラッシュを除いて JWKS の URL を組み立てる
  const base = supabaseUrl.replace(/\/$/, "");
  const jwksUrl = new URL(`${base}/auth/v1/.well-known/jwks.json`);
  _jwks = createRemoteJWKSet(jwksUrl);
  return _jwks;
}

/**
 * Bearer トークン文字列を JWKS で検証し、検証済みユーザー情報を返す。
 * 署名・有効期限が無効な場合は jose が例外を投げる（呼び出し側で 401 に変換する）。
 */
export async function verifySupabaseJwt(token: string): Promise<AuthUser> {
  const jwks = getJwks();
  // Supabase の access token は audience に "authenticated" を持つ
  const { payload } = await jwtVerify(token, jwks, {
    audience: "authenticated",
  });

  // sub（auth.users の UUID）は必須。無ければ無効トークン扱い
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) {
    throw new Error("invalid_token_no_sub");
  }
  const email = typeof payload.email === "string" ? payload.email : null;

  return { id: sub, email };
}
