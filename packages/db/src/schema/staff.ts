import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { store } from "./store";

/**
 * staff（店員さん）テーブル。
 * Supabase Auth のユーザーに紐づく投げ銭の受け取り主体。
 * QR は別テーブルを持たず staff.id を指す URL（/tip/:staffId）として発行する。
 */
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth.users への参照（auth スキーマは Supabase 管理のため FK は張らず ID 文字列で保持）
  authUserId: uuid("auth_user_id").notNull(),
  // 所属店
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  displayName: text("display_name").notNull(),
  // 一言（お客さま向けの自己紹介）
  headline: text("headline"),
  avatarUrl: text("avatar_url"),
  // Stripe Connect の Connected Account（未連携は null）
  stripeAccountId: text("stripe_account_id"),
  // 本人確認・着金可否の状態（none: 未着手 / pending: 審査中 / verified: 着金可能）
  identityStatus: text("identity_status").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
