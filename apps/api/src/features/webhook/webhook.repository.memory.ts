import type { WebhookRepository } from "./webhook.repository.js";

/**
 * webhook feature の Repository 層・インメモリ実装（DB 接続が無い環境向けフォールバック）。
 * 受信済みイベント ID を Set に保持して冪等性を再現する（再起動で消える・開発/評価用途）。
 * 本物の DB と同じ WebhookRepository 契約を満たすため、Service から見ると差し替え可能。
 */
export function createInMemoryWebhookRepository(): WebhookRepository {
  // 処理済みイベント ID の集合
  const seen = new Set<string>();

  return {
    // 初めて見るイベントなら記録して true、すでに見たことがあれば false（冪等にスキップ）
    async recordEventIfNew(stripeEventId) {
      if (seen.has(stripeEventId)) return false;
      seen.add(stripeEventId);
      return true;
    },
  };
}
