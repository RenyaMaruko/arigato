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
  // 招待の種類（staff: スタッフ招待＝在籍・QR / admin: 管理者招待＝store_admin role=admin）。
  // 発行・受け入れの仕組みは共通（コード＋リンク＋accept）だが、受け入れ時にこの type で分岐する。
  // スタッフ招待は owner＋管理者が発行でき、管理者招待は owner のみが発行できる（発行時にロールが確定）。
  type: text("type").notNull().default("staff"),
  // 招待の任意メモ（誰宛か。例「佐藤さん」「ホール担当」）。空なら null。
  // 無記名リンクの手軽さを壊さないため任意項目とし、招待中一覧での識別だけに使う。
  label: text("label"),
  // 招待ステータス（pending: 未消費 / accepted: 消費済み / revoked: 失効）
  status: text("status").notNull().default("pending"),
  // 招待を消費した店員さん（未消費は null）。スタッフ招待の受け手（staff_store を作る人）を保持する。
  acceptedStaffId: uuid("accepted_staff_id").references(() => staff.id),
  // 管理者招待を消費した人（Supabase auth.users の UUID・未消費は null）。
  // 管理者招待の受け手は staff とは限らない（管理だけの人）ため、staff.id ではなく auth_user_id で保持する。
  acceptedAuthUserId: uuid("accepted_auth_user_id"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
