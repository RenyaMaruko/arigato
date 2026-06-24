import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { staff } from "./staff";
import { store } from "./store";
import { staffStore } from "./staff-store";

/**
 * tip（投げ銭）テーブル。構造化された感謝データの中核。
 * 「いつ・どの店で・誰が・どんな文脈で」を保存する。
 * QR=membership（人×店）から解決した staff_id ＋ store_id を送信時点で固定保存し、
 * 後で異動・退店しても文脈が残るようにする。membership_id は追跡用に保持する。
 * 金額は本人のみ閲覧可だが、閲覧制御は Service 層で行う（テーブルには素直に保持）。
 */
export const tip = pgTable("tip", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  // 送信時点の所属店（QR=membership の店を固定保存）
  storeId: uuid("store_id")
    .notNull()
    .references(() => store.id),
  // 送信元の所属（membership＝人×店）。追跡用（退店で所属が外れても tip は残るため任意）。
  membershipId: uuid("membership_id").references(() => staffStore.id),
  // 店員さんに届く満額（円）
  amount: integer("amount").notNull(),
  // 運営手数料（application_fee・円）
  platformFee: integer("platform_fee").notNull(),
  // お客さま支払額（満額 + 上乗せ手数料・円）
  customerTotal: integer("customer_total").notNull(),
  // 任意の一言メッセージ（最大80文字。検証は shared の Zod で担保）
  message: text("message"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Direct charge の Checkout Session ID（Webhook 取りこぼし時の突合・参照に使う）
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  // 決済ステータス（pending / succeeded / failed）
  status: text("status").notNull().default("pending"),
  // 着金ステータス（held: 保留 / payable: 着金可能 / paid: 着金済）
  settlementStatus: text("settlement_status").notNull().default("held"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  succeededAt: timestamp("succeeded_at", { withTimezone: true }),
});
