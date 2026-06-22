import { describe, it, expect, vi } from "vitest";
import { handleStripeWebhook, type VerifiedEvent } from "./webhook.service.js";
import type { WebhookRepository } from "./webhook.repository.js";

/**
 * webhook Service 層のユニットテスト。
 * 「冪等性（同一イベント ID の2回目はスキップ）」と「種別→tip ステータス更新」の契約を、
 * Repository と tip 更新関数をモックに差し替えて実 DB なしで検証する。
 */

// 受信済みイベント ID を Set に持つテスト用 Repository（実装の冪等性挙動を再現）
function makeWebhookRepo(): WebhookRepository {
  const seen = new Set<string>();
  return {
    recordEventIfNew: vi.fn(async (id: string) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  };
}

// payment_intent.succeeded の検証済みイベントを作る（既定は metadata.tipId 付き＝ホスト型 Checkout）
function succeededEvent(
  eventId: string,
  opts: { piId?: string | null; tipId?: string | null } = {},
): VerifiedEvent {
  return {
    id: eventId,
    type: "payment_intent.succeeded",
    // 明示的に null を渡した場合はその null を尊重する（?? だと null を既定値で潰してしまうため）
    paymentIntentId: "piId" in opts ? (opts.piId ?? null) : "pi_1",
    tipId: "tipId" in opts ? (opts.tipId ?? null) : "tip_1",
  };
}

// テスト用の更新関数群（tipId 主・PaymentIntent ID 従）を、件数を固定して作る
function makeUpdateDeps(returns = 1) {
  const byTipId = vi.fn(async () => returns);
  const byPaymentIntentId = vi.fn(async () => returns);
  return { byTipId, byPaymentIntentId };
}

describe("webhook.service handleStripeWebhook", () => {
  it("payment_intent.succeeded（metadata.tipId 付き）で tipId 経路により succeeded に更新する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const result = await handleStripeWebhook(repo, update, succeededEvent("evt_1"));

    // ホスト型 Checkout は tipId を主経路に確定し、判明した PaymentIntent ID も渡す
    expect(update.byTipId).toHaveBeenCalledWith("tip_1", "succeeded", "pi_1");
    expect(update.byPaymentIntentId).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true, duplicate: false, tipUpdated: true });
  });

  it("payment_intent.payment_failed で tip を failed に更新する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const failed: VerifiedEvent = {
      id: "evt_2",
      type: "payment_intent.payment_failed",
      paymentIntentId: "pi_2",
      tipId: "tip_2",
    };
    const result = await handleStripeWebhook(repo, update, failed);

    expect(update.byTipId).toHaveBeenCalledWith("tip_2", "failed", "pi_2");
    expect(result).toEqual({ received: true, duplicate: false, tipUpdated: true });
  });

  it("tipId が無いイベントは PaymentIntent ID の従経路で確定する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const result = await handleStripeWebhook(
      repo,
      update,
      succeededEvent("evt_pi_only", { tipId: null, piId: "pi_only" }),
    );

    expect(update.byTipId).not.toHaveBeenCalled();
    expect(update.byPaymentIntentId).toHaveBeenCalledWith("pi_only", "succeeded");
    expect(result).toEqual({ received: true, duplicate: false, tipUpdated: true });
  });

  it("同一イベント ID を2回送ると2回目は冪等にスキップし tip を二重更新しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    // 1回目: 処理されて tip を更新
    const first = await handleStripeWebhook(repo, update, succeededEvent("evt_same"));
    // 2回目: 同じイベント ID → 冪等にスキップ
    const second = await handleStripeWebhook(repo, update, succeededEvent("evt_same"));

    expect(first).toEqual({ received: true, duplicate: false, tipUpdated: true });
    expect(second).toEqual({ received: true, duplicate: true, tipUpdated: false });
    // tip 更新は1回だけ（二重更新されない）
    expect(update.byTipId).toHaveBeenCalledTimes(1);
  });

  it("対象外の種別は冪等記録のみで tip を更新しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const other: VerifiedEvent = {
      id: "evt_other",
      type: "charge.refunded",
      paymentIntentId: "pi_x",
      tipId: "tip_x",
    };
    const result = await handleStripeWebhook(repo, update, other);

    expect(update.byTipId).not.toHaveBeenCalled();
    expect(update.byPaymentIntentId).not.toHaveBeenCalled();
    expect(result).toEqual({ received: true, duplicate: false, tipUpdated: false });
  });

  it("該当 tip が無ければ tipUpdated は false（無関係なテストイベント等）", async () => {
    const repo = makeWebhookRepo();
    // 更新対象 0 件
    const update = makeUpdateDeps(0);

    const result = await handleStripeWebhook(repo, update, succeededEvent("evt_3"));

    expect(update.byTipId).toHaveBeenCalledWith("tip_1", "succeeded", "pi_1");
    expect(result).toEqual({ received: true, duplicate: false, tipUpdated: false });
  });
});
