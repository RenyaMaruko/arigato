import { createMiddleware } from "hono/factory";
import type { AuthUser } from "../infrastructure/auth/supabase-jwt.js";

/**
 * Supabase JWT 検証ミドルウェア（認証必須ルートに前置する）。
 * Authorization: Bearer <token> を取り出し、注入された verifier（JWKS 検証）で検証する。
 * 検証に成功したら c.var.authUser に検証済みユーザーを格納し、後続のルートで本人スコープに使う。
 * トークンが欠落・無効・期限切れなら 401 を返す（feature には認証の細部を持ち込まない）。
 *
 * verifier 自体は infrastructure/auth に隔離し、ここはコンポジションルートから注入で受け取る。
 */

// c.var に載せる認証コンテキストの型（ルートから c.get("authUser") で参照）
export type AuthVariables = {
  authUser: AuthUser;
};

// トークン検証関数の型（infrastructure/auth の verifySupabaseJwt を注入する）
type VerifyToken = (token: string) => Promise<AuthUser>;

/**
 * 認証ミドルウェアを生成する。verifier はコンポジションルートで配線する。
 */
export function createAuthMiddleware(verifyToken: VerifyToken) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    // Authorization ヘッダから Bearer トークンを取り出す
    const header = c.req.header("Authorization") ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      // トークン欠落
      return c.json({ error: "unauthorized" }, 401);
    }
    const token = match[1]!;

    // JWKS で検証。無効・期限切れは例外 → 401 に変換する
    try {
      const user = await verifyToken(token);
      c.set("authUser", user);
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }

    await next();
  });
}
