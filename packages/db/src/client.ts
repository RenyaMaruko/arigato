import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

/**
 * Drizzle（postgres-js / Supabase）の DB クライアント。
 * 接続は遅延生成する。DATABASE_URL が未設定の環境でも import 時には接続せず、
 * 実際に db を使ったときに初めて検証する（起動・型チェック・マイグレーション生成は接続なしで通る）。
 */

let _db: PostgresJsDatabase<typeof schema> | null = null;

// DATABASE_URL を読んで postgres-js + Drizzle を初期化する（初回呼び出し時のみ）
function createDb(): PostgresJsDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // 接続情報が無い状態で DB アクセスしようとしたら明示的に失敗させる
    throw new Error(
      "DATABASE_URL が未設定です。packages/db/.env.example を参考に接続文字列を設定してください。",
    );
  }
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}

/**
 * DB クライアントの取得関数。
 * Repository 層はこれを呼んで db を得る。最初の呼び出しまで接続を作らない。
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}
