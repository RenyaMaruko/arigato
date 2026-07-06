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
  // 【非使用・後方互換のため残置】旧「1オーナー共有」の所有者カラム。
  // owner 表現は store_admin(role=owner) へ移行済み。新規作成では書き込まず、参照もしない。
  // 物理削除せず非使用化して残す（安全側。既存マイグレーション連番との整合を保つ）。
  ownerAuthUserId: uuid("owner_auth_user_id"),
  // 導入承認に同意した日時。店自身の一手間（「うちで投げ銭OK」の同意）として作成時に記録する。
  // 運営審査のゲート（status の pending→approved）は廃止し、これを導入承認の記録とする。未同意は null。
  adoptionAgreedAt: timestamp("adoption_agreed_at", { withTimezone: true }),
  // 店の論理削除（閉店）。null＝営業中／値あり＝閉店。
  // 閉店すると QR・所属（staff_store）を無効化し、店一覧・解決から除外する。
  // 物理削除はしない（受取記録・資金が store_id を参照するため履歴を保全する）。
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
