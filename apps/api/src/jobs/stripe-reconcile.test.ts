import { describe, it, expect, vi } from "vitest";
import { runDailyReconcile, type DailyReconcileDeps } from "./stripe-reconcile.job.js";
import type { ReconcileStaffTotals } from "../features/staff/staff.repository.js";

/**
 * (e) 日次照合バッチ（runDailyReconcile）のユニットテスト。
 *
 * 「まず合計レベルで照合し、ズレ・未確定のある店員だけを差分として報告する」契約を、
 * DB 合計と Stripe 合計をモックで差し替えて実 DB / 実 Stripe なしで検証する。
 * 観点:
 *  - 合計が一致し未確定も無ければ差分 0（全件精査しない）
 *  - paid 合計が Stripe payout 合計とズレたら payout_total_mismatch を検知
 *  - 未確定（held+payable）合計が Stripe balance とズレたら balance_mismatch を検知
 *  - 未確定 tip / 進行中 payout があれば has_pending として掘り下げ示唆
 *  - Stripe 取得失敗は stripe_error として差分に記録（1件で全体を止めない）
 */

// DB 合計（店員1人分）を作るヘルパ
function totals(overrides: Partial<ReconcileStaffTotals> = {}): ReconcileStaffTotals {
  return {
    staffId: "staff_1",
    connectedAccountId: "acct_1",
    paidTakeTotal: 0,
    unsettledTakeTotal: 0,
    pendingPayoutCount: 0,
    pendingTipCount: 0,
    ...overrides,
  };
}

// deps を組み立てる（DB 合計・Stripe balance・Stripe payout 合計をモックで与える）
function makeDeps(
  list: ReconcileStaffTotals[],
  stripe: { balance: number; paid: number } | ((accountId: string) => { balance: number; paid: number }),
): DailyReconcileDeps {
  const resolve = (accountId: string) => (typeof stripe === "function" ? stripe(accountId) : stripe);
  return {
    listTotals: vi.fn(async () => list),
    getStripeBalanceTotal: vi.fn(async (accountId) => resolve(accountId).balance),
    getStripePaidPayoutTotal: vi.fn(async (accountId) => resolve(accountId).paid),
  };
}

describe("runDailyReconcile（日次照合バッチ）", () => {
  it("合計が一致し未確定も無ければ差分 0（全件精査しない）", async () => {
    const deps = makeDeps(
      [totals({ paidTakeTotal: 1000, unsettledTakeTotal: 500 })],
      { balance: 500, paid: 1000 },
    );
    const summary = await runDailyReconcile(deps);

    expect(summary.checkedStaff).toBe(1);
    expect(summary.diffStaff).toBe(0);
    expect(summary.diffs).toHaveLength(0);
  });

  it("paid 合計が Stripe の成立 payout 合計とズレたら payout_total_mismatch を検知する", async () => {
    const deps = makeDeps(
      [totals({ paidTakeTotal: 1000, unsettledTakeTotal: 500 })],
      // DB の paid 合計 1000 に対し Stripe payout 合計 800（ズレ）
      { balance: 500, paid: 800 },
    );
    const summary = await runDailyReconcile(deps);

    expect(summary.diffStaff).toBe(1);
    expect(summary.diffs[0]!.reasons).toContain("payout_total_mismatch");
    expect(summary.diffs[0]!.dbPaidTakeTotal).toBe(1000);
    expect(summary.diffs[0]!.stripePaidPayoutTotal).toBe(800);
  });

  it("未確定合計が Stripe balance とズレたら balance_mismatch を検知する", async () => {
    const deps = makeDeps(
      [totals({ paidTakeTotal: 0, unsettledTakeTotal: 500 })],
      // DB の未確定 500 に対し Stripe balance 300（ズレ）
      { balance: 300, paid: 0 },
    );
    const summary = await runDailyReconcile(deps);

    expect(summary.diffStaff).toBe(1);
    expect(summary.diffs[0]!.reasons).toContain("balance_mismatch");
  });

  it("未確定 tip / 進行中 payout があれば has_pending を立てて掘り下げを示唆する", async () => {
    const deps = makeDeps(
      [totals({ paidTakeTotal: 0, unsettledTakeTotal: 500, pendingTipCount: 2 })],
      { balance: 500, paid: 0 },
    );
    const summary = await runDailyReconcile(deps);

    // 合計は一致するが pending があるため差分（掘り下げ対象）として報告する
    expect(summary.diffStaff).toBe(1);
    expect(summary.diffs[0]!.reasons).toContain("has_pending");
    expect(summary.diffs[0]!.reasons).not.toContain("balance_mismatch");
  });

  it("Stripe 取得失敗は stripe_error として差分に記録し、他店員の照合は続ける", async () => {
    const list = [
      totals({ staffId: "staff_ok", connectedAccountId: "acct_ok", paidTakeTotal: 100, unsettledTakeTotal: 0 }),
      totals({ staffId: "staff_err", connectedAccountId: "acct_err" }),
    ];
    const deps: DailyReconcileDeps = {
      listTotals: vi.fn(async () => list),
      getStripeBalanceTotal: vi.fn(async (accountId) => {
        if (accountId === "acct_err") throw new Error("stripe down");
        return 0;
      }),
      getStripePaidPayoutTotal: vi.fn(async (accountId) => {
        if (accountId === "acct_err") throw new Error("stripe down");
        return 100;
      }),
    };
    const summary = await runDailyReconcile(deps);

    expect(summary.checkedStaff).toBe(2);
    // ok 側は差分 0、err 側は stripe_error で差分
    const errDiff = summary.diffs.find((d) => d.staffId === "staff_err");
    expect(errDiff).toBeDefined();
    expect(errDiff!.reasons).toContain("stripe_error");
    expect(errDiff!.stripeError).toBe("stripe down");
    expect(summary.diffs.find((d) => d.staffId === "staff_ok")).toBeUndefined();
  });
});
