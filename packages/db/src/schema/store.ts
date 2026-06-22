import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * store（店）テーブル。
 * 店は「導入承認」と「スタッフ管理」のみを担い、お金には触れない。
 * そのため決済・残高に関わるカラムは持たせない（横断ルール: 店はお金に触れない）。
 */
export const store = pgTable("store", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 店舗紹介（任意・設定画面で編集）
  description: text("description"),
  // 業種（任意・設定画面で選択。例: カフェ・喫茶）
  industry: text("industry"),
  // 店のロゴ画像 URL（任意）
  logoUrl: text("logo_url"),
  // 店アカウントの所有者（Supabase auth.users の UUID）。
  // 店スコープのアクセス制御に使う（この auth ユーザーだけが自店を操作できる）。
  // auth スキーマは Supabase 管理のため FK は張らず ID 文字列で保持する。未紐付けは null。
  ownerAuthUserId: uuid("owner_auth_user_id"),
  // 導入ステータス（pending: 承認待ち / approved: 承認済み）
  status: text("status").notNull().default("pending"),
  // 承認された日時（未承認は null）
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
