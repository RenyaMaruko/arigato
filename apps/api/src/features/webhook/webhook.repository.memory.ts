import type { WebhookRepository } from "./webhook.repository.js";

/**
 * webhook feature の Repository 層・インメモリ実装（DB 接続が無い環境向けフォールバック）。
 * 受信済みイベント ID とその処理済みフラグを Map に保持して冪等性を再現する
 * （再起動で消える・開発/評価用途）。
 * 本物の DB と同じ WebhookRepository 契約（受信記録と処理済みマークの分離）を満たすため、
 * Service から見ると差し替え可能。
 */
export function createInMemoryWebhookRepository(): WebhookRepository {
  // イベント ID → 業務処理まで完了したか（false = 受信済みだが未処理＝再送で再処理する）
  const seen = new Map<string, boolean>();

  return {
    // 新規 or 未処理（前回失敗）なら true、処理済みなら false（冪等にスキップ）
    async recordEventIfNew(stripeEventId) {
      const processed = seen.get(stripeEventId);
      if (processed === true) return false;
      // 未登録なら「受信済み・未処理」として記録する
      if (processed === undefined) {
        seen.set(stripeEventId, false);
      }
      return true;
    },

    // 業務処理の成功後に処理済みを刻む
    async markEventProcessed(stripeEventId) {
      seen.set(stripeEventId, true);
    },
  };
}
