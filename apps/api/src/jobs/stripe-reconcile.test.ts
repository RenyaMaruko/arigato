import { describe, it, expect, vi } from "vitest";
import {
  runDailyReconcile,
  runStripeReconcile,
  type DailyReconcileDeps,
} from "./stripe-reconcile.job.js";
import type { ReconcileStaffTotals } from "../features/staff/staff.repository.js";
import type {
  TipRepository,
  PendingTipForReconcile,
} from "../features/tip/tip.repository.js";
import { PENDING_TIP_EXPIRY_HOURS } from "../features/tip/tip.model.js";

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

// --- MAJOR-6: 孤児 pending の掃除（runStripeReconcile） ---

// 突合対象の pending tip 行を作るヘルパ（作成日時を相対時間で指定できる）
function pendingTip(
  tipId: string,
  opts: { paymentIntentId?: string | null; ageHours?: number } = {},
): PendingTipForReconcile {
  const ageMs = (opts.ageHours ?? 0) * 60 * 60 * 1000;
  return {
    tipId,
    paymentIntentId: opts.paymentIntentId === undefined ? `pi_${tipId}` : opts.paymentIntentId,
    checkoutSessionId: null,
    connectedAccountId: "acct_1",
    createdAt: new Date(NOW.getTime() - ageMs),
  };
}

// テストの基準時刻（期限切れ判定を安定させる）
const NOW = new Date("2026-07-06T00:00:00Z");

// runStripeReconcile 用の tip Repository モック（必要なメソッドだけ実装する）
function makeReconcileRepo(
  pendings: PendingTipForReconcile[],
  staleWithoutIntent = 0,
) {
  const updateTipStatusByTipId = vi.fn(async () => 1);
  const failStalePendingTipsWithoutIntent = vi.fn(async () => staleWithoutIntent);
  const repo = {
    listPendingTipsForReconcile: vi.fn(async () => pendings),
    updateTipStatusByTipId,
    failStalePendingTipsWithoutIntent,
  } as unknown as TipRepository;
  return { repo, updateTipStatusByTipId, failStalePendingTipsWithoutIntent };
}

describe("runStripeReconcile（孤児 pending の掃除）", () => {
  it("requires_payment_method のまま24時間超の pending は failed へ掃除する", async () => {
    const { repo, updateTipStatusByTipId } = makeReconcileRepo([
      pendingTip("old", { ageHours: 25 }),
    ]);
    const fetchIntentStatus = vi.fn(async (piId: string) => ({
      paymentIntentId: piId,
      status: "requires_payment_method",
    }));

    const summary = await runStripeReconcile({ repo, fetchIntentStatus, now: () => NOW });

    // 期限切れ → failed 化（お金は動いていないため安全）
    expect(updateTipStatusByTipId).toHaveBeenCalledWith("old", "failed", "pi_old");
    expect(summary.expired).toBe(1);
    expect(summary.failed).toBe(0);
  });

  it("24時間未満の pending は掃除せず残す（次回の突合に回す）", async () => {
    const { repo, updateTipStatusByTipId } = makeReconcileRepo([
      pendingTip("young", { ageHours: 1 }),
    ]);
    const fetchIntentStatus = vi.fn(async (piId: string) => ({
      paymentIntentId: piId,
      status: "requires_payment_method",
    }));

    const summary = await runStripeReconcile({ repo, fetchIntentStatus, now: () => NOW });

    expect(updateTipStatusByTipId).not.toHaveBeenCalled();
    expect(summary.expired).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it("processing は期限超過でも触らない（資金が動いている可能性があるため）", async () => {
    const { repo, updateTipStatusByTipId } = makeReconcileRepo([
      pendingTip("proc", { ageHours: 48 }),
    ]);
    const fetchIntentStatus = vi.fn(async (piId: string) => ({
      paymentIntentId: piId,
      status: "processing",
    }));

    const summary = await runStripeReconcile({ repo, fetchIntentStatus, now: () => NOW });

    expect(updateTipStatusByTipId).not.toHaveBeenCalled();
    expect(summary.expired).toBe(0);
    expect(summary.skipped).toBe(1);
  });

  it("succeeded の突合確定は従来どおり行う（掃除と共存する）", async () => {
    const { repo, updateTipStatusByTipId } = makeReconcileRepo([
      pendingTip("done", { ageHours: 30 }),
    ]);
    // Stripe 側で成功が確定していたら、期限に関わらず succeeded へ写像する（遅延成功の救済）
    const fetchIntentStatus = vi.fn(async (piId: string) => ({
      paymentIntentId: piId,
      status: "succeeded",
    }));

    const summary = await runStripeReconcile({ repo, fetchIntentStatus, now: () => NOW });

    expect(updateTipStatusByTipId).toHaveBeenCalledWith("done", "succeeded", "pi_done");
    expect(summary.succeeded).toBe(1);
    expect(summary.expired).toBe(0);
  });

  it("PaymentIntent 無しの期限切れ pending は一括掃除（failStalePendingTipsWithoutIntent）で回収する", async () => {
    // PI 無しの行はループではスキップされ、一括 SQL 側で 3 件掃除される想定
    const { repo, failStalePendingTipsWithoutIntent } = makeReconcileRepo(
      [pendingTip("no_pi", { paymentIntentId: null, ageHours: 30 })],
      3,
    );
    const fetchIntentStatus = vi.fn(async (piId: string) => ({
      paymentIntentId: piId,
      status: "requires_payment_method",
    }));

    const summary = await runStripeReconcile({ repo, fetchIntentStatus, now: () => NOW });

    // 期限は Model の定数（PENDING_TIP_EXPIRY_HOURS）で渡る
    expect(failStalePendingTipsWithoutIntent).toHaveBeenCalledWith(PENDING_TIP_EXPIRY_HOURS);
    expect(summary.expired).toBe(3);
    // PI 無しの行はループではスキップ扱い
    expect(summary.skipped).toBe(1);
  });
});
