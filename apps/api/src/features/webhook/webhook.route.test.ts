import { describe, it, expect, vi } from "vitest";
import { createWebhookRoute } from "./webhook.route.js";
import type { VerifiedEvent, HandleWebhookResult } from "./webhook.service.js";

/**
 * webhook Route 層の HTTP 契約テスト（実 Stripe・実 DB なし。依存はモックで注入する）。
 *  - 署名不正は 400
 *  - 業務処理の失敗は 500（Stripe の再送に委ねる＝イベントの恒久ロスト防止）
 *  - 成功時は { received: true } のみ返す（内部の処理結果を外部へ返さない）
 */

// 署名検証を通過した体の最小イベント（Route は中身を解釈しない）
const verifiedEvent: VerifiedEvent = {
  id: "evt_route",
  type: "payment_intent.succeeded",
  eventAccountId: null,
  paymentIntentId: "pi_route",
  tipId: "tip_route",
  accountId: null,
  payoutsEnabled: null,
  requirementsErrorCount: null,
  requirementsPendingVerificationCount: null,
  requirementsPastDueCount: null,
  requirementsCurrentlyDueCount: null,
  payoutId: null,
  payoutMetadataId: null,
  payoutArrivedAt: null,
  payoutFailureReason: null,
  chargeId: null,
  chargeConnectedAccountId: null,
  settlementCorrection: null,
};

// handleEvent が返す体の処理結果（Route はこれを外部へ返さない）
const okResult: HandleWebhookResult = {
  received: true,
  duplicate: false,
  tipUpdated: true,
  identityVerified: false,
  promotedTips: 0,
  payoutUpdated: false,
  settlementMirrored: false,
  ledgerEntries: 0,
  settlementCorrected: false,
};

// 署名検証エラー（infrastructure 由来のエラー名を模す）
function verificationError(): Error {
  const err = new Error("bad signature");
  err.name = "WebhookVerificationError";
  return err;
}

describe("webhook.route POST /stripe", () => {
  it("成功時は 200 で { received: true } のみ返す（内部の処理結果を漏らさない）", async () => {
    const route = createWebhookRoute({
      verifyEvent: vi.fn(() => verifiedEvent),
      handleEvent: vi.fn(async () => okResult),
    });

    const res = await route.request("/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig" },
    });

    expect(res.status).toBe(200);
    // tipUpdated 等の内部情報は含まれない
    expect(await res.json()).toEqual({ received: true });
  });

  it("業務処理が失敗したら 500 を返す（Stripe の再送で再処理される）", async () => {
    const route = createWebhookRoute({
      verifyEvent: vi.fn(() => verifiedEvent),
      handleEvent: vi.fn(async () => {
        throw new Error("db down");
      }),
    });

    const res = await route.request("/stripe", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig" },
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "processing_failed" });
  });

  it("署名不正は 400 で拒否する（従来どおり）", async () => {
    const handleEvent = vi.fn(async () => okResult);
    const route = createWebhookRoute({
      verifyEvent: vi.fn(() => {
        throw verificationError();
      }),
      handleEvent,
    });

    const res = await route.request("/stripe", { method: "POST", body: "{}" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
    // 署名不正では業務処理を呼ばない
    expect(handleEvent).not.toHaveBeenCalled();
  });
});
