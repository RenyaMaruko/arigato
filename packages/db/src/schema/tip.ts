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
  // 投げ銭の額面＝お客さま支払額（円）。店員手取りはこの約85%（手数料15%・決済料込み）
  amount: integer("amount").notNull(),
  // 運営手数料（application_fee = 額面 − 店員手取り ≈ 15%・円）。
  // ここに格納するのは application_fee（15%）そのもの。運営の純取り分は本番で Stripe 決済料(約3.6%)が
  // application_fee から引かれて約11.4%になる（列には入らない）。
  platformFee: integer("platform_fee").notNull(),
  // お客さま支払額（額面・円。上乗せ廃止のため = amount）
  customerTotal: integer("customer_total").notNull(),
  // 任意の一言メッセージ（最大80文字。検証は shared の Zod で担保）
  message: text("message"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  // Direct charge の Checkout Session ID（Webhook 取りこぼし時の突合・参照に使う）
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  // (c) Stripe を残高の真実の源泉とするための「鏡」列。
  //   charge.updated / payment_intent.succeeded 受信時に charge を expand して取得し保存する。
  //   送金候補の事前フィルタ・UI 表示（「◯日後に送金できます」）の精緻化に使う。
  //   ただし送金可否の最終判定は必ず送金直前の balance.retrieve（実 available）で行う（これは予測・並べ替え用）。
  // この tip の charge ID（ch_…）。返金・チャージバックの逆引き照合にも使う
  stripeChargeId: text("stripe_charge_id"),
  // この charge の balance_transaction ID（txn_…）。payout 内訳との突合（台帳 d）に使う
  balanceTransactionId: text("balance_transaction_id"),
  // Stripe で送金可能（available）になる見込み時刻（pending→available の確定見込み）
  availableOn: timestamp("available_on", { withTimezone: true }),
  // balance_transaction の状態（pending: 確定待ち / available: 送金可能）。
  //   available_on 経過＆bt_status=available の tip だけを送金候補の事前フィルタに使う
  btStatus: text("bt_status"),
  // 決済ステータス（pending / succeeded / failed）
  status: text("status").notNull().default("pending"),
  // 着金ステータス（held: 保留 / payable: 着金可能 / paid: 着金済 / refunded: 返金済 / disputed: 異議申立）。
  //   (f) refunded / disputed は残高・受取履歴・送金候補から除外する（負残高を握りつぶさず安全に扱う）。
  settlementStatus: text("settlement_status").notNull().default("held"),
  // この tip がどの送金（payout）で paid になったかの追跡（未送金は null）。
  // payout.failed で paid→payable へ戻すときに、対象 tip をこの payout_id で特定する。
  // payout テーブルを直接 import すると循環参照になるため、FK は payout 側から張らず ID 文字列で保持する。
  payoutId: uuid("payout_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  succeededAt: timestamp("succeeded_at", { withTimezone: true }),
});
