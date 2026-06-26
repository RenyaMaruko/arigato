import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { staff } from "./staff";

/**
 * payout（送金＝振込申請）テーブル。
 * 手動送金（メルカリ型）の1回分の申請を表す。verified（口座登録済＝payouts_enabled）な店員さんが、
 * 着金可能額（payable な tip の手取り合計）の「全額」を自分のタイミングで銀行へ送金申請する。
 *
 * amount は送金額＝店員さんが銀行で受け取る額（手取り合計・円）。送金手数料は店員から取らない。
 * 申請時に対象の payable な tip を paid に更新し、その手取り合計で Stripe payout を実行する
 * （Connected Account の残高→銀行）。確定は Webhook を正とする:
 *  - payout.paid   → status=paid・arrived_at 記録
 *  - payout.failed → status=failed・failure_reason 記録・該当 tip を payable へ戻す
 *
 * 金額は本人のみ閲覧可だが、閲覧制御は Service 層で行う（テーブルには素直に保持）。
 */
export const payout = pgTable("payout", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 送金申請した店員さん（人）
  staffId: uuid("staff_id")
    .notNull()
    .references(() => staff.id),
  // 送金額＝店員さんが銀行で受け取る額（payable な tip の手取り合計・円）
  amount: integer("amount").notNull(),
  // 送金ステータス（pending: 申請中 / paid: 着金済 / failed: 失敗）
  status: text("status").notNull().default("pending"),
  // Stripe の Payout ID（Connected Account 上の payout。Webhook の payout.* と照合する）
  stripePayoutId: text("stripe_payout_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // 着金日（payout.paid Webhook で記録。未着金は null）
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  // 失敗理由（payout.failed Webhook で記録。失敗していなければ null）
  failureReason: text("failure_reason"),
});
