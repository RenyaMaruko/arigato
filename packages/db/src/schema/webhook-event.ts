import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * webhook_event（冪等性）テーブル。
 * Stripe Webhook は同じイベントが再送されうるため、受信イベントIDを記録して
 * 重複を無視する（二重処理の防止）。stripe_event_id を一意に保つ。
 *
 * processed_at は「業務処理まで完了したか」の印（null = 受信済みだが業務処理は未完了）。
 * 受信記録と業務処理は別コミットになるため、業務処理が失敗したイベントは processed_at が
 * null のまま残り、Stripe の再送で再処理できる（イベントの恒久ロストを防ぐ）。
 */
export const webhookEvent = pgTable("webhook_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stripe のイベントID（一意。重複再送の検知に使う）
  stripeEventId: text("stripe_event_id").notNull().unique(),
  // イベント種別（payment_intent.succeeded など）
  type: text("type").notNull(),
  // 業務処理まで完了した日時（null = 未処理。再送時に再処理する）
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
