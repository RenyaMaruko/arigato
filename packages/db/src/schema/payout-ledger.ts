import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { payout } from "./payout";

/**
 * payout_ledger（送金の照合台帳）テーブル。
 *
 * 設計の肝（d・Stripe を残高の真実の源泉とする照合台帳）:
 *  - 手動送金（メルカリ型）は Stripe が「どの取引（charge）を含むか」を自動識別しない（公式）。
 *    そのため payout 作成・成功後に balance_transactions?payout=po_… で内訳を取得し、
 *    各 balance_transaction の source(ch_…) から tip を逆引きして
 *    「payout ⇄ balance_transaction ⇄ tip」の対応をこの台帳に記録する（唯一の突き合わせ手段）。
 *  - **追記専用（append-only）・不変**: 既存行は決して UPDATE / DELETE しない。
 *    payout.failed 等の補正も「新しい補正エントリを追記」することで表現し、既存行は書き換えない。
 *    これにより監査可能で改ざんできない照合台帳になる。
 *
 * 1行＝「ある payout に含まれる1つの balance_transaction（＝多くは1つの charge＝1つの tip）」の対応、
 * もしくは送金失敗・調整などの補正エントリを表す。
 */
export const payoutLedger = pgTable("payout_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  // 対応づける自前 payout 行（送金1回分）。台帳は基本 payout に紐づく。
  //   ただし (f) の返金・チャージバック補正は、まだ送金されていない tip にも起こり得るため null 可とする
  //   （送金前の返金は payout が存在しない＝対応する送金が無い補正エントリ）。
  payoutId: uuid("payout_id").references(() => payout.id),
  // Stripe の balance_transaction ID（txn_…）。payout 内訳の1要素。
  //   payout 自身の balance_transaction（type=payout）は charge を持たないため、null になり得る
  balanceTransactionId: text("balance_transaction_id"),
  // balance_transaction の source から逆引きした charge ID（ch_…）。payout 行自体は null
  stripeChargeId: text("stripe_charge_id"),
  // charge から逆引きした自前 tip の ID（逆引きできない・対象外は null）
  tipId: uuid("tip_id"),
  // この台帳エントリの金額（円）。balance_transaction の amount（payout はマイナス、charge はプラス側など）
  amount: integer("amount").notNull(),
  // エントリ種別（charge: 売上 / payout: 送金そのもの / refund: 返金 / adjustment: 調整 / dispute: 異議 /
  //   payout_failed: 送金失敗の補正 など）。Stripe の balance_transaction.type を基本に、補正は独自種別で追記する
  type: text("type").notNull(),
  // 追記日時（不変）
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
