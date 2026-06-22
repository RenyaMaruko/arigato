import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { store } from "./store";
import { staff } from "./staff";

/**
 * staff_invite（スタッフ招待）テーブル — スタッフ追加方式A。
 * 店が招待コードを発行し、店員さんはその招待経由でアカウント作成・所属確定する。
 * これにより「店の承認」が招待で自然に担保される。
 * 店員さんは自分のプロフィール作成時に code を消費し、staff.store_id が確定する。
 */
export const staffInvite = pgTable("staff_invite", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 招待を発行した店
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  // 招待コード/リンク用トークン（一意）
  code: text("code").notNull().unique(),
  // 招待ステータス（pending: 未消費 / accepted: 消費済み / revoked: 失効）
  status: text("status").notNull().default("pending"),
  // 招待を消費した店員さん（未消費は null）
  acceptedStaffId: uuid("accepted_staff_id").references(() => staff.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
