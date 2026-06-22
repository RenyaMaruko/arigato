import { getDb, sql } from "@arigato/db";

/**
 * staff feature の Repository 層（DB アクセス専用・生 SQL）。
 * Sprint 1 では骨格のみ。プロフィール取得・保存の本実装は後続スプリントで拡張する。
 */

/**
 * auth ユーザーIDから staff が存在するかを確認する（骨格用の最小クエリ）。
 */
export async function existsStaffByAuthUserId(authUserId: string): Promise<boolean> {
  const db = getDb();
  // 生 SQL は Repository 層のみで書く
  const rows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS(SELECT 1 FROM staff WHERE auth_user_id = ${authUserId}) AS exists`,
  );
  return rows[0]?.exists ?? false;
}
