import { describe, it, expect } from "vitest";
import type { IdentityStatus, SettlementStatus, TipStatus } from "@arigato/shared";
import { initialSettlementStatusOnSucceeded } from "./tip.model.js";
import {
  handleStripeWebhook,
  type VerifiedEvent,
} from "../webhook/webhook.service.js";
import { createInMemoryWebhookRepository } from "../webhook/webhook.repository.memory.js";

/**
 * 「verified 済み店員の新規 tip が succeeded 時に payable で確定する」契約の結合テスト。
 *
 * spec §7「本人確認済の状態で成立した分は succeeded 時に payable から開始」を、
 * webhook Service + 注入された tip 確定関数 + 本人確認反映関数の組み合わせで検証する。
 * 実 DB 無しでも回るよう、staff の identity_status と tip の settlement_status を保持する
 * 小さなインメモリ・ストアを用意し、実装と同じ判定（Model 純粋関数）で確定させる。
 *
 * 観点:
 *  - verified 店員の tip → succeeded 時に payable で確定
 *  - 未verified（none / pending）店員の tip → held で確定
 *  - 後から account.updated（payouts_enabled=true）で held → payable へ昇格（従来動作の非破壊）
 */

// テスト用の店員（identity_status を持つ）
type TestStaff = { staffId: string; identityStatus: IdentityStatus; stripeAccountId: string };
// テスト用の tip（決済状態と着金状態を持つ）
type TestTip = { tipId: string; staffId: string; status: TipStatus; settlementStatus: SettlementStatus };

// 実装（tip.repository）と同じ振る舞いを再現する最小ストア。
// 判定は production と同一の Model 純粋関数を使う（ロジックの二重実装ではなく同じ関数を呼ぶ）。
function makeStore() {
  const staff = new Map<string, TestStaff>();
  const tips = new Map<string, TestTip>();

  return {
    staff,
    tips,
    // 店員を登録する
    addStaff(s: TestStaff) {
      staff.set(s.staffId, s);
    },
    // tip を pending・held で作成する（実装の insertTip と同じ初期状態）
    addPendingTip(t: { tipId: string; staffId: string }) {
      tips.set(t.tipId, {
        tipId: t.tipId,
        staffId: t.staffId,
        status: "pending",
        settlementStatus: "held",
      });
    },
    // webhook Service に注入する updateTip.byTipId 相当。
    // succeeded 確定時は送り先店員の identity_status から settlement_status を確定する。
    byTipId(tipId: string, status: TipStatus): number {
      const tip = tips.get(tipId);
      if (!tip || tip.status === status) return 0;
      if (status === "succeeded") {
        const s = staff.get(tip.staffId)!;
        // 本実装と同じ判定（Model 純粋関数）
        tip.settlementStatus = initialSettlementStatusOnSucceeded(s.identityStatus);
      }
      tip.status = status;
      return 1;
    },
    // webhook Service に注入する applyAccountUpdate 相当。
    // payouts_enabled=true で verified に確定し、その店員の held を payable へ昇格する。
    applyAccountUpdate(stripeAccountId: string, payoutsEnabled: boolean) {
      let target: TestStaff | undefined;
      for (const s of staff.values()) {
        if (s.stripeAccountId === stripeAccountId) {
          target = s;
          break;
        }
      }
      if (!target) return { found: false, verified: false, promotedTips: 0 };
      if (!payoutsEnabled) {
        return { found: true, verified: target.identityStatus === "verified", promotedTips: 0 };
      }
      if (target.identityStatus === "verified") {
        return { found: true, verified: true, promotedTips: 0 };
      }
      target.identityStatus = "verified";
      let promoted = 0;
      for (const tip of tips.values()) {
        if (tip.staffId === target.staffId && tip.settlementStatus === "held") {
          tip.settlementStatus = "payable";
          promoted += 1;
        }
      }
      return { found: true, verified: true, promotedTips: promoted };
    },
  };
}

// store を webhook Service の依存形に合わせて配線する
function wire(store: ReturnType<typeof makeStore>) {
  const repo = createInMemoryWebhookRepository();
  const updateTip = {
    byTipId: async (tipId: string, status: TipStatus) => store.byTipId(tipId, status),
    byPaymentIntentId: async () => 0,
  };
  const applyAccountUpdate = async (accountId: string, payoutsEnabled: boolean) =>
    store.applyAccountUpdate(accountId, payoutsEnabled);
  return { repo, updateTip, applyAccountUpdate };
}

// payment_intent.succeeded（metadata.tipId 付き）の検証済みイベント
function succeeded(eventId: string, tipId: string): VerifiedEvent {
  return {
    id: eventId,
    type: "payment_intent.succeeded",
    paymentIntentId: `pi_${tipId}`,
    tipId,
    accountId: null,
    payoutsEnabled: null,
  };
}

// account.updated（payouts_enabled=true）の検証済みイベント
function accountUpdated(eventId: string, accountId: string): VerifiedEvent {
  return {
    id: eventId,
    type: "account.updated",
    paymentIntentId: null,
    tipId: null,
    accountId,
    payoutsEnabled: true,
  };
}

describe("verified 店員の tip が succeeded 時に payable で確定する（spec §7）", () => {
  it("verified 店員の新規 tip は succeeded 時に payable で確定する", async () => {
    const store = makeStore();
    store.addStaff({ staffId: "staff_v", identityStatus: "verified", stripeAccountId: "acct_v" });
    store.addPendingTip({ tipId: "tip_v", staffId: "staff_v" });
    const { repo, updateTip, applyAccountUpdate } = wire(store);

    await handleStripeWebhook(repo, updateTip, applyAccountUpdate, succeeded("evt_v", "tip_v"));

    const tip = store.tips.get("tip_v")!;
    expect(tip.status).toBe("succeeded");
    expect(tip.settlementStatus).toBe("payable");
  });

  it("未着手（none）店員の tip は held で確定する", async () => {
    const store = makeStore();
    store.addStaff({ staffId: "staff_n", identityStatus: "none", stripeAccountId: "acct_n" });
    store.addPendingTip({ tipId: "tip_n", staffId: "staff_n" });
    const { repo, updateTip, applyAccountUpdate } = wire(store);

    await handleStripeWebhook(repo, updateTip, applyAccountUpdate, succeeded("evt_n", "tip_n"));

    const tip = store.tips.get("tip_n")!;
    expect(tip.status).toBe("succeeded");
    expect(tip.settlementStatus).toBe("held");
  });

  it("審査中（pending）店員の tip も held で確定する", async () => {
    const store = makeStore();
    store.addStaff({ staffId: "staff_p", identityStatus: "pending", stripeAccountId: "acct_p" });
    store.addPendingTip({ tipId: "tip_p", staffId: "staff_p" });
    const { repo, updateTip, applyAccountUpdate } = wire(store);

    await handleStripeWebhook(repo, updateTip, applyAccountUpdate, succeeded("evt_p", "tip_p"));

    expect(store.tips.get("tip_p")!.settlementStatus).toBe("held");
  });

  it("未verified で held 確定後、account.updated で held → payable へ昇格する（従来動作の非破壊）", async () => {
    const store = makeStore();
    store.addStaff({ staffId: "staff_l", identityStatus: "none", stripeAccountId: "acct_l" });
    store.addPendingTip({ tipId: "tip_l", staffId: "staff_l" });
    const { repo, updateTip, applyAccountUpdate } = wire(store);

    // 先に succeeded（このときは未verified なので held）
    await handleStripeWebhook(repo, updateTip, applyAccountUpdate, succeeded("evt_l", "tip_l"));
    expect(store.tips.get("tip_l")!.settlementStatus).toBe("held");

    // 後から本人確認完了 → account.updated で held を payable へ昇格
    const result = await handleStripeWebhook(
      repo,
      updateTip,
      applyAccountUpdate,
      accountUpdated("evt_l_acct", "acct_l"),
    );

    expect(result.identityVerified).toBe(true);
    expect(result.promotedTips).toBe(1);
    expect(store.tips.get("tip_l")!.settlementStatus).toBe("payable");
  });
});
