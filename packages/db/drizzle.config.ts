import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit の設定。
 * public.* のスキーマを管理し、SQL マイグレーションを ./drizzle に生成する。
 * DATABASE_URL が無くても generate（SQL 生成）は通る。migrate（実 DB 反映）時のみ接続が必要。
 */
export default defineConfig({
  dialect: "postgresql",
  // 個別のスキーマファイルを直接読む（index.ts の再エクスポートは含めない）
  schema: ["./src/schema/store.ts", "./src/schema/staff.ts", "./src/schema/staff-store.ts", "./src/schema/staff-invite.ts", "./src/schema/tip.ts", "./src/schema/webhook-event.ts"],
  out: "./drizzle",
  // public スキーマのみ管理（auth.* は Supabase 任せ）
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/placeholder",
  },
});
