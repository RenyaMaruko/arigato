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
  // auth スキーマは Supabase 管理のため FK は張らず ID 文字列で保持する。
  // セルフサーブ登録では作成者が必ず所有者になる。移行用の既存行は null のままでも壊れない設計。
  ownerAuthUserId: uuid("owner_auth_user_id"),
  // 導入承認に同意した日時。店自身の一手間（「うちで投げ銭OK」の同意）として作成時に記録する。
  // 運営審査のゲート（status の pending→approved）は廃止し、これを導入承認の記録とする。未同意は null。
  adoptionAgreedAt: timestamp("adoption_agreed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
