import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * staff（店員さん＝人）テーブル。
 * Supabase Auth のユーザーに紐づく投げ銭の受け取り主体。
 * プロフィール（表示名・一言・写真・Stripe口座・本人確認状態）を「人ごとに1つ」持ち、全所属店で共通。
 *
 * 所属（どの店に居るか）は staff_store（中間テーブル）で多対多に表す（掛け持ち対応）。
 * そのため staff からは store_id を撤去している（所属は staff_store が真実の源泉）。
 * QR は別テーブルを持たず staff_store.id（membership＝人×店）を指す URL（/tip/:membershipId）として発行する。
 */
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Supabase auth.users への参照（auth スキーマは Supabase 管理のため FK は張らず ID 文字列で保持）。
  // 人ごと1プロフィールのため一意。
  authUserId: uuid("auth_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  // 一言（お客さま向けの自己紹介）
  headline: text("headline"),
  avatarUrl: text("avatar_url"),
  // Stripe Connect の Connected Account（未連携は null）。人ごとに1つ。
  stripeAccountId: text("stripe_account_id"),
  // 本人確認・着金可否の状態（none: 未着手 / pending: 審査中 / action_required: 要対応＝審査NG・追加書類 /
  // verified: 着金可能）。人ごと。text のため値の追加にマイグレーションは不要（CHECK 制約なし）。
  identityStatus: text("identity_status").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
