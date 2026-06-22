import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * store（店）テーブル。
 * 店は「導入承認」と「スタッフ管理」のみを担い、お金には触れない。
 * そのため決済・残高に関わるカラムは持たせない（横断ルール: 店はお金に触れない）。
 */
export const store = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 導入ステータス（pending: 承認待ち / approved: 承認済み）
  status: text("status").notNull().default("pending"),
  // 承認された日時（未承認は null）
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
