/**
 * @arigato/db の公開エントリ。
 * DB クライアント取得関数・スキーマ・SQL タグをまとめて re-export し、
 * バック（apps/api）の Repository 層から利用できるようにする。
 * （生 SQL を書くための `sql` も db パッケージ経由で提供し、api 側に drizzle-orm の直接依存を持たせない）
 */
export { getDb } from "./client.js";
export * as schema from "./schema/index.js";
export { sql } from "drizzle-orm";
