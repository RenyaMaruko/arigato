import { getDb, sql } from "@arigato/db";

/**
 * webhook feature の Repository 層（DB アクセス専用・生 SQL）。
 * Stripe Webhook の冪等性を担保する webhook_event テーブルへの記録を扱う。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼ばない。
 *
 * Service へ注入できるよう、関数群をインターフェース（WebhookRepository）として束ねて公開する。
 */

export type WebhookRepository = {
  // 受信イベント ID を記録する。すでに記録済み（重複再送）なら false を返す（冪等性）。
  recordEventIfNew: (stripeEventId: string, type: string) => Promise<boolean>;
};

/**
 * 実 DB（Drizzle / postgres-js）に対する WebhookRepository 実装を生成する。
 */
export function createWebhookRepository(): WebhookRepository {
  return {
    // stripe_event_id は UNIQUE 制約付き。ON CONFLICT DO NOTHING で
    // 「初回挿入できたら true / 既存（重複再送）なら 0 行＝false」を原子的に判定する。
    async recordEventIfNew(stripeEventId, type) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        INSERT INTO webhook_event (stripe_event_id, type)
        VALUES (${stripeEventId}, ${type})
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING id
      `);
      // 1 行返れば新規、0 行なら既に処理済み
      return rows.length > 0;
    },
  };
}
