import { pgTable, uuid, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { store } from "./store";

/**
 * store_admin（店舗の管理者＝人×店＋ロール）テーブル。
 * 「店舗＝組織」に個人の管理者（owner / admin）をひも付けるモデルの中核。
 * 旧 store.owner_auth_user_id（1オーナー共有）を置き換え、owner を各店1人＋管理者(admin)を複数持てる形にする。
 *
 * - role=owner: 店の所有者（管理者管理・owner譲渡・店削除ができる。各店に常に1人）
 * - role=admin: 日常運用の管理者（店情報編集・スタッフ招待/管理・記録閲覧ができる）
 *
 * left_at は論理削除（管理者を外した/抜けた）。null＝在籍中（active）。
 * 物理削除はしない（作成順＝created_at を owner 自動継承の「最古参」判定に使うため履歴を保つ）。
 */
export const storeAdmin = pgTable(
  "store_admin",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 管理者がひも付く店
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id),
    // 管理者の人（Supabase auth.users の UUID）。
    // auth スキーマは Supabase 管理のため FK は張らず ID 文字列で保持する（store.owner_auth_user_id と同方式）。
    authUserId: uuid("auth_user_id").notNull(),
    // ロール（owner: 所有者 / admin: 管理者）
    role: text("role").notNull(),
    // 昇格順の判定（owner 自動継承の「最古参」）に使う作成日時
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 論理削除（管理者を外した/抜けた）。null＝在籍中（active）。物理削除しない
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => ({
    // 同じ (store_id, auth_user_id) は1行＝同一人が同一店で二重管理者にならない
    storeAdminUnique: unique("store_admin_store_id_auth_user_id_unique").on(t.storeId, t.authUserId),
    // owner は各店に常に1人だけ（active な owner が店ごと1行）。
    // 部分ユニークインデックスで DB レベルの不変条件を担保する（アプリロジックとの二重防御）。
    oneActiveOwnerPerStore: uniqueIndex("store_admin_one_active_owner_per_store")
      .on(t.storeId)
      .where(sql`role = 'owner' AND left_at IS NULL`),
  }),
);
