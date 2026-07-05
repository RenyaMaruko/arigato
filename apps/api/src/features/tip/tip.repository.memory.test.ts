import { describe, it, expect, beforeEach } from "vitest";
import { createInMemoryTipRepository } from "./tip.repository.memory.js";
import type { TipRepository } from "./tip.repository.js";

/**
 * tip Repository（インメモリ実装）のステータス遷移契約のテスト。
 * 実 DB 実装（tip.repository.ts）と同じ契約を検証する:
 *  - succeeded は終端状態。遅延到着した payment_failed（failed への更新）が
 *    succeeded 確定済みの行を巻き戻さない（0行更新）。
 *  - failed への更新は pending の行に限定する。
 *  - succeeded への更新は pending / failed のどちらからでも確定できる（遅延成功の救済）。
 * Stripe はイベント順序を保証しないため、この契約が「確定済み入金の消失」を構造的に防ぐ。
 */
describe("tip.repository.memory ステータス遷移（succeeded は終端状態）", () => {
  let repo: TipRepository;
  let tipId: string;

  // pending の tip を1件（PaymentIntent 付き）用意する
  beforeEach(async () => {
    repo = createInMemoryTipRepository();
    const row = await repo.insertTip({
      staffId: "00000000-0000-0000-0000-000000000001",
      storeId: "00000000-0000-0000-0000-000000000010",
      membershipId: "00000000-0000-0000-0000-000000000100",
      amount: 300,
      platformFee: 45,
      customerTotal: 300,
      message: null,
      status: "pending",
      settlementStatus: "held",
      stripePaymentIntentId: "pi_test_1",
      stripeCheckoutSessionId: null,
    });
    tipId = row.id;
  });

  it("succeeded 確定後に遅延した failed が来ても巻き戻らない（tipId 経路・0行更新）", async () => {
    // まず succeeded に確定する
    expect(await repo.updateTipStatusByTipId(tipId, "succeeded", "pi_test_1")).toBe(1);
    // 遅延到着した payment_failed は無視される（0行更新・succeeded のまま）
    expect(await repo.updateTipStatusByTipId(tipId, "failed", "pi_test_1")).toBe(0);
    const after = await repo.findTipById(tipId);
    expect(after!.status).toBe("succeeded");
  });

  it("succeeded 確定後に遅延した failed が来ても巻き戻らない（PaymentIntent 経路・0行更新）", async () => {
    expect(await repo.updateTipStatusByPaymentIntentId("pi_test_1", "succeeded")).toBe(1);
    // PaymentIntent ID 経路でも同じく巻き戻らない
    expect(await repo.updateTipStatusByPaymentIntentId("pi_test_1", "failed")).toBe(0);
    const after = await repo.findTipById(tipId);
    expect(after!.status).toBe("succeeded");
  });

  it("pending → failed は更新できる（正常な失敗確定）", async () => {
    expect(await repo.updateTipStatusByTipId(tipId, "failed", "pi_test_1")).toBe(1);
    const after = await repo.findTipById(tipId);
    expect(after!.status).toBe("failed");
  });

  it("failed → succeeded は更新できる（遅延した成功の救済・従来どおり）", async () => {
    await repo.updateTipStatusByTipId(tipId, "failed", "pi_test_1");
    // 失敗と記録した後に succeeded が届いたら成功へ確定できる（実 DB の status <> 'succeeded' と同じ）
    expect(await repo.updateTipStatusByTipId(tipId, "succeeded", "pi_test_1")).toBe(1);
    const after = await repo.findTipById(tipId);
    expect(after!.status).toBe("succeeded");
  });
});
