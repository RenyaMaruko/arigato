import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * webhook_event（冪等性）テーブル。
 * Stripe Webhook は同じイベントが再送されうるため、処理済みイベントIDを記録して
 * 重複を無視する（二重記録の防止）。stripe_event_id を一意に保つ。
 */
export const webhookEvent = pgTable("webhook_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stripe のイベントID（一意。重複再送の検知に使う）
  stripeEventId: text("stripe_event_id").notNull().unique(),
  // イベント種別（payment_intent.succeeded など）
  type: text("type").notNull(),
  // 処理した日時
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
