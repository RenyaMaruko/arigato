import { pgTable, uuid, timestamp, unique } from "drizzle-orm/pg-core";
import { staff } from "./staff";
import { store } from "./store";

/**
 * staff_store（所属＝membership）テーブル。
 * 「1人の店員（staff＝人）が複数の店に所属できる」多対多（掛け持ち）を表す中間テーブル。
 *
 * これが QR の単位＝membership。QR URL は staff_store.id を指す（/tip/:membershipId）。
 * お客さま投げ銭画面は membership から staff(人)＋store(店) を解決して表示する。固定・再発行/失効なし。
 * 退店時はこの所属を外す（人やプロフィールは残る）。
 *
 * 一意制約 (staff_id, store_id)：同じ人が同じ店に二重所属できない（多重参加不可）。
 */
export const staffStore = pgTable(
  "staff_store",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 所属する人（staff＝人）
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id),
    // 所属する店
    storeId: uuid("store_id")
      .notNull()
      .references(() => store.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // 脱退・在籍解除の時刻（論理削除）。null＝在籍中（active）、値あり＝脱退済み。
    // 物理削除はしない（tip が membership_id を参照するため履歴を保持する）。
    // 再参加（join）時は left_at を null に戻して再有効化する（同じ membershipId＝同じ QR が復活する）。
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => ({
    // 同じ (staff_id, store_id) は1件＝二重所属不可（多重参加を DB レベルで防ぐ）
    staffStoreUnique: unique("staff_store_staff_id_store_id_unique").on(t.staffId, t.storeId),
  }),
);
