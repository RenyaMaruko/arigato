import { getDb, sql } from "@arigato/db";

/**
 * store feature の Repository 層（DB アクセス専用・生 SQL）。
 * Sprint 1 では骨格のみ。承認・スタッフ一覧の本実装は後続スプリントで拡張する。
 */

/**
 * 店が存在するかを確認する（骨格用の最小クエリ）。
 */
export async function existsStore(storeId: string): Promise<boolean> {
  const db = getDb();
  // 生 SQL は Repository 層のみで書く
  const rows = await db.execute<{ exists: boolean }>(
    sql`SELECT EXISTS(SELECT 1 FROM store WHERE id = ${storeId}) AS exists`,
  );
  return rows[0]?.exists ?? false;
}
