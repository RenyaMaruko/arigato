import { getDb, sql } from "@arigato/db";

/**
 * webhook feature の Repository 層（DB アクセス専用・生 SQL）。
 * Stripe Webhook の冪等性を担保する webhook_event テーブルへの記録を扱う。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼ばない。
 *
 * 冪等の設計（イベントの恒久ロスト防止）:
 *  - 受信記録（INSERT）と業務処理は同一トランザクションにできない（各業務 Repository が自前 Tx を張る）ため、
 *    「受信した」と「業務処理まで完了した（processed_at）」を分けて記録する。
 *  - 業務処理が失敗したイベントは processed_at が null のまま残り、Stripe の再送で再処理される。
 *    processed_at が入って初めて「処理済み＝再送スキップ」になる。
 *
 * Service へ注入できるよう、関数群をインターフェース（WebhookRepository）として束ねて公開する。
 */

export type WebhookRepository = {
  // 受信イベントを記録し「業務処理すべきか」を返す。
  // 新規 or 未処理（前回失敗）の既存なら true、処理済み（processed_at あり）の既存なら false（冪等スキップ）。
  recordEventIfNew: (stripeEventId: string, type: string) => Promise<boolean>;
  // 業務処理の成功後に処理済み（processed_at=now()）を刻む。以降の再送は冪等にスキップされる。
  markEventProcessed: (stripeEventId: string) => Promise<void>;
};

/**
 * 実 DB（Drizzle / postgres-js）に対する WebhookRepository 実装を生成する。
 */
export function createWebhookRepository(): WebhookRepository {
  return {
    // stripe_event_id は UNIQUE 制約付き。1文の INSERT ... ON CONFLICT DO UPDATE で
    //  - 新規: INSERT 成功 → 1 行返る（処理する）
    //  - 既存かつ未処理（processed_at IS NULL・前回失敗の残骸）: DO UPDATE が成立 → 1 行返る（再処理する）
    //  - 既存かつ処理済み: WHERE で DO UPDATE が不成立 → 0 行（冪等スキップ）
    // を原子的に判定する。同時二重配送でも UNIQUE により行は1つしか作られない。
    async recordEventIfNew(stripeEventId, type) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        INSERT INTO webhook_event (stripe_event_id, type)
        VALUES (${stripeEventId}, ${type})
        ON CONFLICT (stripe_event_id) DO UPDATE
          SET type = EXCLUDED.type
          WHERE webhook_event.processed_at IS NULL
        RETURNING id
      `);
      // 1 行返れば「新規 or 未処理の既存」＝処理続行、0 行なら処理済み＝スキップ
      return rows.length > 0;
    },

    // 業務処理まで完了したら processed_at を刻む（以降の再送は recordEventIfNew が false を返す）
    async markEventProcessed(stripeEventId) {
      const db = getDb();
      await db.execute(sql`
        UPDATE webhook_event
        SET processed_at = now()
        WHERE stripe_event_id = ${stripeEventId}
      `);
    },
  };
}
