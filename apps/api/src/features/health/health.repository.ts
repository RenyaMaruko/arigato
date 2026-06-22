import { getDb, sql } from "@arigato/db";

/**
 * health feature の Repository 層（DB アクセス専用）。
 * 生 SQL は Repository 層のみで書く（アーキテクチャ規約）。
 */

/**
 * DB へ疎通できるかを確認する。
 * 接続情報が無い／DB がダウンしている場合は false を返し、ヘルスチェック自体は落とさない。
 */
export async function pingDatabase(): Promise<boolean> {
  try {
    // DATABASE_URL 未設定時はここで例外になる（getDb が投げる）
    const db = getDb();
    // 最小の疎通確認クエリ（生 SQL）
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    // 接続できなくてもヘルスチェックは続行させる
    return false;
  }
}
