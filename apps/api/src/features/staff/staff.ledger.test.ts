import { describe, it, expect, vi } from "vitest";
import {
  recordPayoutLedger,
  recordSettlementCorrectionLedger,
} from "./staff.service.js";
import type { StaffRepository } from "./staff.repository.js";

/**
 * (d) 照合台帳の追記・(f) 返金/異議の補正追記の契約テスト。
 *
 * staff Service の recordPayoutLedger / recordSettlementCorrectionLedger を、
 * Repository をモックに差し替えて実 DB / 実 Stripe なしで検証する。
 * 観点:
 *  - (d) 手動送金は「この payout で paid にした tip（tip.payout_id リンク）」を源泉に、
 *        payout⇄bt⇄tip を台帳へ追記する（balance_transactions?payout= は手動送金に使えない Stripe 制約のため）。
 *  - (d) 手取り換算で記録し、payout 自身の控え（マイナス）も追記して内訳合計が 0 に突き合う。
 *  - (d) 該当 payout が無ければ追記しない（0）。
 *  - (f) 返金/異議は手取りをマイナスで台帳へ追記し type を refund/dispute にする。
 */

// 必要なメソッドだけ持つ部分モック Repository を作る（型は StaffRepository に合わせる）
function makeRepo(overrides: Partial<StaffRepository>): StaffRepository {
  return overrides as unknown as StaffRepository;
}

// recordPayoutLedger は自動送金用の listEntries を受けるが手動送金では使わない（no-op を渡す）
const unusedListEntries = vi.fn(async () => []);

describe("recordPayoutLedger（d: 送金の照合台帳・手動送金は DB リンク源泉）", () => {
  it("この payout で paid にした tip を手取り換算で台帳へ追記し、payout 控え（マイナス）も足す", async () => {
    let appended: Array<{ balanceTransactionId: string | null; stripeChargeId: string | null; tipId: string | null; amount: number; type: string }> = [];
    const repo = makeRepo({
      findPayoutForLedger: vi.fn(async () => ({
        payoutId: "po_row",
        stripePayoutId: "po_stripe",
        connectedAccountId: "acct_1",
      })),
      // tip.payout_id でこの payout に紐づく tip（(c) で鏡保存した bt/charge と額面）
      listPaidTipsForPayout: vi.fn(async () => [
        { tipId: "tip_1", balanceTransactionId: "txn_1", stripeChargeId: "ch_1", amount: 1000 },
        { tipId: "tip_2", balanceTransactionId: "txn_2", stripeChargeId: "ch_2", amount: 300 },
      ]),
      appendPayoutLedgerEntries: vi.fn(async (_payoutId: string, entries) => {
        appended = entries;
        return entries.length;
      }),
    });

    const count = await recordPayoutLedger(repo, unusedListEntries, {
      stripePayoutId: "po_stripe",
      payoutId: "po_row",
    });

    // charge 2件 ＋ payout 控え1件 = 3件
    expect(count).toBe(3);
    // tip は手取り換算（1000→850, 300→255）で記録
    const c1 = appended.find((e) => e.tipId === "tip_1")!;
    expect(c1).toMatchObject({ stripeChargeId: "ch_1", balanceTransactionId: "txn_1", amount: 850, type: "charge" });
    const c2 = appended.find((e) => e.tipId === "tip_2")!;
    expect(c2.amount).toBe(255);
    // payout 控えは合計のマイナス（850+255=1105 → -1105）。bt id は Stripe Payout ID で冪等化
    const po = appended.find((e) => e.type === "payout")!;
    expect(po.amount).toBe(-1105);
    expect(po.tipId).toBeNull();
    expect(po.balanceTransactionId).toBe("po_stripe");
    // 内訳合計は 0（突き合う）
    expect(appended.reduce((s, e) => s + e.amount, 0)).toBe(0);
  });

  it("該当 payout が無ければ台帳を追記しない（0）", async () => {
    const repo = makeRepo({
      findPayoutForLedger: vi.fn(async () => null),
      listPaidTipsForPayout: vi.fn(async () => []),
      appendPayoutLedgerEntries: vi.fn(async () => 0),
    });
    const count = await recordPayoutLedger(repo, unusedListEntries, {
      stripePayoutId: "po_missing",
      payoutId: null,
    });
    expect(count).toBe(0);
  });
});

describe("recordSettlementCorrectionLedger（f: 返金・異議の補正追記）", () => {
  it("返金は手取りをマイナスで台帳へ追記し type=refund にする（append-only）", async () => {
    const calls: Array<{ payoutId: string | null; tipId: string | null; stripeChargeId: string | null; amount: number; type: string }> = [];
    const repo = makeRepo({
      appendLedgerCorrection: vi.fn(async (p) => {
        calls.push(p);
        return "ledger_id";
      }),
    });

    // 額面 1000 → 手取り floor(1000*0.85)=850。返金はマイナス -850 で記録
    const id = await recordSettlementCorrectionLedger(repo, {
      kind: "refunded",
      tipId: "tip_1",
      faceAmount: 1000,
      stripeChargeId: "ch_1",
    });

    expect(id).toBe("ledger_id");
    expect(calls[0]).toEqual({
      payoutId: null,
      tipId: "tip_1",
      stripeChargeId: "ch_1",
      amount: -850,
      type: "refund",
    });
  });

  it("異議（dispute）は type=dispute で手取りをマイナス記録する", async () => {
    const calls: Array<{ amount: number; type: string }> = [];
    const repo = makeRepo({
      appendLedgerCorrection: vi.fn(async (p) => {
        calls.push({ amount: p.amount, type: p.type });
        return "ledger_id2";
      }),
    });

    await recordSettlementCorrectionLedger(repo, {
      kind: "disputed",
      tipId: "tip_2",
      faceAmount: 500,
      stripeChargeId: "ch_2",
    });

    // 額面 500 → 手取り 425、マイナスで記録・type=dispute
    expect(calls[0]).toEqual({ amount: -425, type: "dispute" });
  });
});
