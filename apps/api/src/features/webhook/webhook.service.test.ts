import { describe, it, expect, vi } from "vitest";
import {
  handleStripeWebhook,
  type VerifiedEvent,
  type SettlementDeps,
} from "./webhook.service.js";
import type { WebhookRepository } from "./webhook.repository.js";

// (c)(d)(f) の追加ユースケースを束ねた no-op の settlementDeps（既存テスト向けの既定値）。
// 個別テストで mirror/ledger/correction を検証するときは差し替える。
function makeSettlementDeps(overrides: Partial<SettlementDeps> = {}): SettlementDeps {
  return {
    recordTipSettlementMirror: vi.fn(async () => false),
    recordPayoutLedger: vi.fn(async () => 0),
    applySettlementCorrection: vi.fn(async () => false),
    ...overrides,
  };
}
const noopSettlementDeps = makeSettlementDeps();

/**
 * webhook Service 層のユニットテスト。
 * 「冪等性（処理済みイベントの再送はスキップ・業務処理失敗は再送で再処理）」と
 * 「種別→tip ステータス更新」の契約を、Repository と tip 更新関数をモックに差し替えて実 DB なしで検証する。
 */

// 受信イベント ID と処理済みフラグを Map に持つテスト用 Repository（実装の冪等性挙動を再現）。
// 「処理済み」だけをスキップし、「受信済みだが未処理（前回失敗）」は再処理する契約。
function makeWebhookRepo(): WebhookRepository {
  const processed = new Map<string, boolean>();
  return {
    recordEventIfNew: vi.fn(async (id: string) => {
      if (processed.get(id) === true) return false;
      if (!processed.has(id)) processed.set(id, false);
      return true;
    }),
    markEventProcessed: vi.fn(async (id: string) => {
      processed.set(id, true);
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
    eventAccountId: null,
    // 明示的に null を渡した場合はその null を尊重する（?? だと null を既定値で潰してしまうため）
    paymentIntentId: "piId" in opts ? (opts.piId ?? null) : "pi_1",
    tipId: "tipId" in opts ? (opts.tipId ?? null) : "tip_1",
    accountId: null,
    payoutsEnabled: null,
    requirementsPendingVerificationCount: null,
    requirementsErrorCount: null,
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
}

// account.updated の検証済みイベントを作る（Connected Account ID・payouts_enabled に加え、
// 審査NG・審査中・追加書類の判定材料（requirements の各件数）も指定できる）
function accountUpdatedEvent(
  eventId: string,
  accountId: string,
  payoutsEnabled: boolean,
  opts: {
    errorCount?: number;
    pendingVerificationCount?: number;
    pastDueCount?: number;
    currentlyDueCount?: number;
  } = {},
): VerifiedEvent {
  return {
    id: eventId,
    type: "account.updated",
    eventAccountId: null,
    paymentIntentId: null,
    tipId: null,
    accountId,
    payoutsEnabled,
    requirementsErrorCount: opts.errorCount ?? 0,
    requirementsPendingVerificationCount: opts.pendingVerificationCount ?? 0,
    requirementsPastDueCount: opts.pastDueCount ?? 0,
    requirementsCurrentlyDueCount: opts.currentlyDueCount ?? 0,
    payoutId: null,
    payoutMetadataId: null,
    payoutArrivedAt: null,
    payoutFailureReason: null,
    chargeId: null,
    chargeConnectedAccountId: null,
    settlementCorrection: null,
  };
}

// payout.paid / payout.failed の検証済みイベントを作る（Stripe Payout ID で照合する）
function payoutEvent(
  eventId: string,
  type: "payout.paid" | "payout.failed",
  payoutId: string,
  opts: { arrivedAt?: Date | null; failureReason?: string | null; metadataId?: string | null } = {},
): VerifiedEvent {
  return {
    id: eventId,
    type,
    eventAccountId: null,
    paymentIntentId: null,
    tipId: null,
    accountId: null,
    payoutsEnabled: null,
    requirementsPendingVerificationCount: null,
    requirementsErrorCount: null,
    requirementsPastDueCount: null,
    requirementsCurrentlyDueCount: null,
    payoutId,
    payoutMetadataId: opts.metadataId ?? null,
    payoutArrivedAt: opts.arrivedAt ?? null,
    payoutFailureReason: opts.failureReason ?? null,
    chargeId: null,
    chargeConnectedAccountId: null,
    settlementCorrection: null,
  };
}

// payout.* 反映関数のモック。反映できたか（true）を返す。冪等のため受信済み payout ID は false にできる。
function makeApplyPayoutUpdate(updated = true) {
  const seen = new Set<string>();
  return vi.fn(
    async (params: {
      kind: "paid" | "failed";
      stripePayoutId: string;
      payoutId: string | null;
      arrivedAt: Date | null;
      failureReason: string | null;
    }) => {
      if (seen.has(params.stripePayoutId)) return false;
      seen.add(params.stripePayoutId);
      return updated;
    },
  );
}

// 既定の no-op applyPayoutUpdate（payout 以外のテストで使う）
const noopApplyPayoutUpdate = vi.fn(async () => false);

// テスト用の更新関数群（tipId 主・PaymentIntent ID 従）を、件数を固定して作る
function makeUpdateDeps(returns = 1) {
  const byTipId = vi.fn(async () => returns);
  const byPaymentIntentId = vi.fn(async () => returns);
  return { byTipId, byPaymentIntentId };
}

// account.updated 反映関数のモック。verified へ遷移し held→payable へ promote した件数を返す。
// 既に verified の場合（2回目）は二重遷移しないよう promotedTips=0 を返すようにできる。
// 第2引数は account 状態（payouts_enabled・requirements の各件数）のオブジェクト。
function makeApplyAccountUpdate(promoted = 0) {
  const seenVerified = new Set<string>();
  return vi.fn(
    async (
      accountId: string,
      account: {
        payoutsEnabled: boolean;
        requirementsErrorCount: number;
        pendingVerificationCount: number;
        pastDueCount: number;
        currentlyDueCount: number;
      },
    ) => {
      if (!account.payoutsEnabled) return { found: true, verified: false, promotedTips: 0 };
      // 既に verified にした口座は二重遷移しない
      if (seenVerified.has(accountId)) {
        return { found: true, verified: true, promotedTips: 0 };
      }
      seenVerified.add(accountId);
      return { found: true, verified: true, promotedTips: promoted };
    },
  );
}

// 既定の no-op applyAccountUpdate（payment_intent 系テストで使う）
const noopApplyAccountUpdate = vi.fn(async () => ({
  found: false,
  verified: false,
  promotedTips: 0,
}));

describe("webhook.service handleStripeWebhook", () => {
  it("payment_intent.succeeded（metadata.tipId 付き）で tipId 経路により succeeded に更新する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_1"),
    );

    // ホスト型 Checkout は tipId を主経路に確定し、判明した PaymentIntent ID も渡す
    // （第4引数はイベントの発生元口座＝帰属口座検証。account なしイベントは null）
    expect(update.byTipId).toHaveBeenCalledWith("tip_1", "succeeded", "pi_1", null);
    expect(update.byPaymentIntentId).not.toHaveBeenCalled();
    expect(result).toEqual({
      received: true,
      duplicate: false,
      tipUpdated: true,
      identityVerified: false,
      promotedTips: 0,
      payoutUpdated: false,
      settlementMirrored: false,
      ledgerEntries: 0,
      settlementCorrected: false,
    });
  });

  it("payment_intent.payment_failed で tip を failed に更新する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const failed: VerifiedEvent = {
      id: "evt_2",
      type: "payment_intent.payment_failed",
      eventAccountId: null,
      paymentIntentId: "pi_2",
      tipId: "tip_2",
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
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
    const result = await handleStripeWebhook(repo, update, noopApplyAccountUpdate, noopApplyPayoutUpdate, noopSettlementDeps, failed);

    expect(update.byTipId).toHaveBeenCalledWith("tip_2", "failed", "pi_2", null);
    expect(result.tipUpdated).toBe(true);
  });

  it("tipId が無いイベントは PaymentIntent ID の従経路で確定する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_pi_only", { tipId: null, piId: "pi_only" }),
    );

    expect(update.byTipId).not.toHaveBeenCalled();
    expect(update.byPaymentIntentId).toHaveBeenCalledWith("pi_only", "succeeded", null);
    expect(result.tipUpdated).toBe(true);
  });

  it("同一イベント ID を2回送ると2回目は冪等にスキップし tip を二重更新しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    // 1回目: 処理されて tip を更新
    const first = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_same"),
    );
    // 2回目: 同じイベント ID → 冪等にスキップ
    const second = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_same"),
    );

    expect(first.tipUpdated).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.tipUpdated).toBe(false);
    // tip 更新は1回だけ（二重更新されない）
    expect(update.byTipId).toHaveBeenCalledTimes(1);
  });

  it("対象外の種別は冪等記録のみで tip を更新しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    const other: VerifiedEvent = {
      id: "evt_other",
      type: "charge.refunded",
      eventAccountId: null,
      paymentIntentId: "pi_x",
      tipId: "tip_x",
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
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
    const result = await handleStripeWebhook(repo, update, noopApplyAccountUpdate, noopApplyPayoutUpdate, noopSettlementDeps, other);

    expect(update.byTipId).not.toHaveBeenCalled();
    expect(update.byPaymentIntentId).not.toHaveBeenCalled();
    expect(result.tipUpdated).toBe(false);
  });

  it("該当 tip が無ければ tipUpdated は false（無関係なテストイベント等）", async () => {
    const repo = makeWebhookRepo();
    // 更新対象 0 件
    const update = makeUpdateDeps(0);

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_3"),
    );

    expect(update.byTipId).toHaveBeenCalledWith("tip_1", "succeeded", "pi_1", null);
    expect(result.tipUpdated).toBe(false);
  });

  // --- account.updated（本人確認・着金の遷移） ---

  it("account.updated（payouts_enabled=true）で identity を verified にし held→payable へ遷移する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    // held が3件 payable へ昇格する想定
    const applyAccountUpdate = makeApplyAccountUpdate(3);

    const result = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_1", "acct_123", true),
    );

    // account 状態（payouts_enabled・requirements の各件数）がオブジェクトで渡る
    expect(applyAccountUpdate).toHaveBeenCalledWith("acct_123", {
      payoutsEnabled: true,
      requirementsErrorCount: 0,
      pendingVerificationCount: 0,
      pastDueCount: 0,
      currentlyDueCount: 0,
    });
    // tip の決済更新（byTipId / byPaymentIntentId）は呼ばれない
    expect(update.byTipId).not.toHaveBeenCalled();
    expect(result).toEqual({
      received: true,
      duplicate: false,
      tipUpdated: false,
      identityVerified: true,
      promotedTips: 3,
      payoutUpdated: false,
      settlementMirrored: false,
      ledgerEntries: 0,
      settlementCorrected: false,
    });
  });

  it("account.updated は冪等で、同一イベント再送では二重遷移しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyAccountUpdate = makeApplyAccountUpdate(3);

    const first = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_same", "acct_123", true),
    );
    // 同一イベント ID の再送 → webhook_event の冪等性でスキップ
    const second = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_same", "acct_123", true),
    );

    expect(first.identityVerified).toBe(true);
    expect(first.promotedTips).toBe(3);
    // 2回目は冪等スキップ。applyAccountUpdate は1回しか呼ばれない（二重遷移しない）
    expect(second.duplicate).toBe(true);
    expect(second.promotedTips).toBe(0);
    expect(applyAccountUpdate).toHaveBeenCalledTimes(1);
  });

  it("account.updated が別イベント ID でも、既に verified なら tip を二重昇格しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    // 同じ口座への2回目は promotedTips=0（実装の applyAccountUpdate が verified を見て二重遷移を防ぐ）
    const applyAccountUpdate = makeApplyAccountUpdate(2);

    const first = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_a", "acct_777", true),
    );
    // 別イベント ID（webhook_event は通過する）だが、口座は既に verified
    const second = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_b", "acct_777", true),
    );

    expect(first.promotedTips).toBe(2);
    // 2回目はイベント自体は処理されるが、口座が既に verified のため昇格 0 件（二重遷移しない）
    expect(second.duplicate).toBe(false);
    expect(second.identityVerified).toBe(true);
    expect(second.promotedTips).toBe(0);
  });

  it("account.updated（payouts_enabled=false）はまだ verified にしない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyAccountUpdate = makeApplyAccountUpdate(0);

    const result = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_pending", "acct_999", false),
    );

    expect(applyAccountUpdate).toHaveBeenCalledWith("acct_999", {
      payoutsEnabled: false,
      requirementsErrorCount: 0,
      pendingVerificationCount: 0,
      pastDueCount: 0,
      currentlyDueCount: 0,
    });
    expect(result.identityVerified).toBe(false);
    expect(result.promotedTips).toBe(0);
  });

  it("account.updated の requirements（errors / pending_verification / past_due / currently_due）を反映関数へ渡す", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyAccountUpdate = makeApplyAccountUpdate(0);

    // 審査NG相当（errors 1件・審査中 4件・past_due 2件・currently_due 3件）の account.updated
    const result = await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      accountUpdatedEvent("evt_acct_req", "acct_req", false, {
        errorCount: 1,
        pendingVerificationCount: 4,
        pastDueCount: 2,
        currentlyDueCount: 3,
      }),
    );

    // 抽出した requirements の件数がそのまま反映関数へ渡る（状態遷移の判定は staff 側で行う）
    expect(applyAccountUpdate).toHaveBeenCalledWith("acct_req", {
      payoutsEnabled: false,
      requirementsErrorCount: 1,
      pendingVerificationCount: 4,
      pastDueCount: 2,
      currentlyDueCount: 3,
    });
    // payouts_enabled=false のため verified にはならない（要対応でも held→payable は昇格しない）
    expect(result.identityVerified).toBe(false);
    expect(result.promotedTips).toBe(0);
  });

  it("account.updated で requirements が抽出できなかった場合（null）は 0 扱いで渡す（安全側フォールバック）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyAccountUpdate = makeApplyAccountUpdate(0);

    // 件数がすべて null のイベント（抽出不能）を模す → ?? 0 で要対応へ誤遷移させない
    const evt: VerifiedEvent = {
      ...accountUpdatedEvent("evt_acct_null", "acct_null", false),
      requirementsErrorCount: null,
      requirementsPendingVerificationCount: null,
      requirementsPastDueCount: null,
      requirementsCurrentlyDueCount: null,
    };
    await handleStripeWebhook(
      repo,
      update,
      applyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      evt,
    );

    expect(applyAccountUpdate).toHaveBeenCalledWith("acct_null", {
      payoutsEnabled: false,
      requirementsErrorCount: 0,
      pendingVerificationCount: 0,
      pastDueCount: 0,
      currentlyDueCount: 0,
    });
  });

  // --- payout.paid / payout.failed（送金の着金確定・失敗） ---

  it("payout.paid で送金を着金済へ反映する（着金日時を渡す）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);
    const arrivedAt = new Date("2026-06-30T00:00:00Z");

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      noopSettlementDeps,
      payoutEvent("evt_po_paid", "payout.paid", "po_123", { arrivedAt }),
    );

    // 着金確定は Webhook を正とする。kind=paid・arrivedAt を渡して反映する
    expect(applyPayout).toHaveBeenCalledWith({
      kind: "paid",
      stripePayoutId: "po_123",
      payoutId: null,
      arrivedAt,
      failureReason: null,
    });
    // tip の決済更新・account 反映は呼ばれない
    expect(update.byTipId).not.toHaveBeenCalled();
    expect(noopApplyAccountUpdate).not.toHaveBeenCalled();
    expect(result.payoutUpdated).toBe(true);
  });

  it("payout.failed で送金を失敗にし、tip を payable へ戻す（失敗理由を渡す）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      noopSettlementDeps,
      payoutEvent("evt_po_failed", "payout.failed", "po_456", {
        failureReason: "account_closed",
      }),
    );

    expect(applyPayout).toHaveBeenCalledWith({
      kind: "failed",
      stripePayoutId: "po_456",
      payoutId: null,
      arrivedAt: null,
      failureReason: "account_closed",
    });
    expect(result.payoutUpdated).toBe(true);
  });

  it("payout.* は冪等で、同一イベント再送では二重反映しない", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);

    const first = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      noopSettlementDeps,
      payoutEvent("evt_po_same", "payout.paid", "po_789"),
    );
    // 同一イベント ID の再送 → webhook_event の冪等性でスキップ
    const second = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      noopSettlementDeps,
      payoutEvent("evt_po_same", "payout.paid", "po_789"),
    );

    expect(first.payoutUpdated).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.payoutUpdated).toBe(false);
    // 反映は1回だけ（二重反映しない）
    expect(applyPayout).toHaveBeenCalledTimes(1);
  });

  it("payout.* の metadata.payout_id（自前 id）を照合バックアップとして反映関数へ渡す", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);
    const arrivedAt = new Date("2026-07-03T00:00:00Z");

    await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      noopSettlementDeps,
      payoutEvent("evt_po_meta", "payout.paid", "po_meta", {
        arrivedAt,
        metadataId: "our-payout-uuid",
      }),
    );

    // stripe_payout_id（主）に加え、metadata 由来の payoutId（従）も反映関数へ渡る
    expect(applyPayout).toHaveBeenCalledWith({
      kind: "paid",
      stripePayoutId: "po_meta",
      payoutId: "our-payout-uuid",
      arrivedAt,
      failureReason: null,
    });
  });

  // --- (c) 確定見込み（charge / balance_transaction）の鏡保存 ---

  it("(c) payment_intent.succeeded で charge があれば確定見込みを tip へ鏡保存する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const recordTipSettlementMirror = vi.fn(async () => true);
    const deps = makeSettlementDeps({ recordTipSettlementMirror });

    // charge ID と発生元 Connected Account を伴う succeeded イベント
    const evt: VerifiedEvent = {
      ...succeededEvent("evt_mirror"),
      chargeId: "ch_123",
      chargeConnectedAccountId: "acct_c",
    };
    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      deps,
      evt,
    );

    // 決済確定（tipUpdated）に加え、確定見込みの鏡保存も行われる
    expect(result.tipUpdated).toBe(true);
    expect(recordTipSettlementMirror).toHaveBeenCalledWith({
      tipId: "tip_1",
      paymentIntentId: "pi_1",
      chargeId: "ch_123",
      connectedAccountId: "acct_c",
    });
    expect(result.settlementMirrored).toBe(true);
  });

  it("(c) charge.updated は tip の決済確定をせず、確定見込みの鏡保存だけ行う", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const recordTipSettlementMirror = vi.fn(async () => true);
    const deps = makeSettlementDeps({ recordTipSettlementMirror });

    const evt: VerifiedEvent = {
      id: "evt_charge_updated",
      type: "charge.updated",
      eventAccountId: null,
      paymentIntentId: "pi_x",
      tipId: "tip_x",
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
      requirementsPastDueCount: null,
      requirementsCurrentlyDueCount: null,
      payoutId: null,
      payoutMetadataId: null,
      payoutArrivedAt: null,
      payoutFailureReason: null,
      chargeId: "ch_x",
      chargeConnectedAccountId: "acct_x",
      settlementCorrection: null,
    };
    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      deps,
      evt,
    );

    // 決済確定（byTipId）は呼ばれない。鏡保存だけ行う
    expect(update.byTipId).not.toHaveBeenCalled();
    expect(result.tipUpdated).toBe(false);
    expect(recordTipSettlementMirror).toHaveBeenCalledTimes(1);
    expect(result.settlementMirrored).toBe(true);
  });

  it("(c) 鏡保存が失敗しても決済確定は壊れない（後続イベントで埋め直せる）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const recordTipSettlementMirror = vi.fn(async () => {
      throw new Error("balance_transaction 未付与");
    });
    const deps = makeSettlementDeps({ recordTipSettlementMirror });

    const evt: VerifiedEvent = {
      ...succeededEvent("evt_mirror_fail"),
      chargeId: "ch_fail",
      chargeConnectedAccountId: "acct_f",
    };
    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      deps,
      evt,
    );

    // 決済確定は成立し、鏡保存だけ false（失敗を握りつぶして決済を壊さない）
    expect(result.tipUpdated).toBe(true);
    expect(result.settlementMirrored).toBe(false);
  });

  // --- (d) 送金の照合台帳追記 ---

  it("(d) payout.paid で照合台帳を追記する（balance_transaction ↔ tip の突き合わせ）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);
    const recordPayoutLedger = vi.fn(async () => 2);
    const deps = makeSettlementDeps({ recordPayoutLedger });

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      deps,
      payoutEvent("evt_po_ledger", "payout.paid", "po_ledger", { metadataId: "our-uuid" }),
    );

    expect(recordPayoutLedger).toHaveBeenCalledWith({
      stripePayoutId: "po_ledger",
      payoutId: "our-uuid",
    });
    expect(result.payoutUpdated).toBe(true);
    expect(result.ledgerEntries).toBe(2);
  });

  it("(d) payout.failed では照合台帳を追記しない（成立した送金だけ突き合わせる）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);
    const recordPayoutLedger = vi.fn(async () => 0);
    const deps = makeSettlementDeps({ recordPayoutLedger });

    await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      deps,
      payoutEvent("evt_po_failed_ledger", "payout.failed", "po_f", {
        failureReason: "account_closed",
      }),
    );

    expect(recordPayoutLedger).not.toHaveBeenCalled();
  });

  it("(d) 台帳追記が失敗しても送金の着金確定は維持する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(0);
    const applyPayout = makeApplyPayoutUpdate(true);
    const recordPayoutLedger = vi.fn(async () => {
      throw new Error("ledger down");
    });
    const deps = makeSettlementDeps({ recordPayoutLedger });

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      applyPayout,
      deps,
      payoutEvent("evt_po_ledger_fail", "payout.paid", "po_lf"),
    );

    // 着金確定は維持・台帳件数は 0（失敗を握り、送金確定を壊さない）
    expect(result.payoutUpdated).toBe(true);
    expect(result.ledgerEntries).toBe(0);
  });

  // --- (f) 返金・チャージバック（残高・履歴・送金候補から除外） ---

  it("(f) charge.refunded で tip を refunded へ遷移する（決済確定の写像はしない）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const applySettlementCorrection = vi.fn(async () => true);
    const deps = makeSettlementDeps({ applySettlementCorrection });

    const evt: VerifiedEvent = {
      id: "evt_refund",
      type: "charge.refunded",
      eventAccountId: "acct_r",
      paymentIntentId: "pi_r",
      tipId: null,
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
      requirementsPastDueCount: null,
      requirementsCurrentlyDueCount: null,
      payoutId: null,
      payoutMetadataId: null,
      payoutArrivedAt: null,
      payoutFailureReason: null,
      chargeId: "ch_r",
      chargeConnectedAccountId: "acct_r",
      settlementCorrection: "refunded",
    };
    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      deps,
      evt,
    );

    expect(applySettlementCorrection).toHaveBeenCalledWith({
      kind: "refunded",
      chargeId: "ch_r",
      paymentIntentId: "pi_r",
      // イベントの発生元口座も渡す（帰属口座検証・多層防御）
      connectedAccountId: "acct_r",
    });
    // 返金イベントは決済確定の写像をしない（byTipId は呼ばれない）
    expect(update.byTipId).not.toHaveBeenCalled();
    expect(result.settlementCorrected).toBe(true);
  });

  it("(f) charge.dispute.created で tip を disputed へ遷移する", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const applySettlementCorrection = vi.fn(async () => true);
    const deps = makeSettlementDeps({ applySettlementCorrection });

    const evt: VerifiedEvent = {
      id: "evt_dispute",
      type: "charge.dispute.created",
      eventAccountId: "acct_d",
      paymentIntentId: "pi_d",
      tipId: null,
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
      requirementsPastDueCount: null,
      requirementsCurrentlyDueCount: null,
      payoutId: null,
      payoutMetadataId: null,
      payoutArrivedAt: null,
      payoutFailureReason: null,
      chargeId: "ch_d",
      chargeConnectedAccountId: "acct_d",
      settlementCorrection: "disputed",
    };
    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      deps,
      evt,
    );

    expect(applySettlementCorrection).toHaveBeenCalledWith({
      kind: "disputed",
      chargeId: "ch_d",
      paymentIntentId: "pi_d",
      connectedAccountId: "acct_d",
    });
    expect(result.settlementCorrected).toBe(true);
  });

  it("(f) 返金・異議も冪等（同一イベント再送では二重遷移しない）", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);
    const applySettlementCorrection = vi.fn(async () => true);
    const deps = makeSettlementDeps({ applySettlementCorrection });

    const evt: VerifiedEvent = {
      id: "evt_refund_same",
      type: "charge.refunded",
      eventAccountId: null,
      paymentIntentId: "pi_rs",
      tipId: null,
      accountId: null,
      payoutsEnabled: null,
      requirementsPendingVerificationCount: null,
      requirementsErrorCount: null,
      requirementsPastDueCount: null,
      requirementsCurrentlyDueCount: null,
      payoutId: null,
      payoutMetadataId: null,
      payoutArrivedAt: null,
      payoutFailureReason: null,
      chargeId: "ch_rs",
      chargeConnectedAccountId: "acct_rs",
      settlementCorrection: "refunded",
    };
    const first = await handleStripeWebhook(repo, update, noopApplyAccountUpdate, noopApplyPayoutUpdate, deps, evt);
    const second = await handleStripeWebhook(repo, update, noopApplyAccountUpdate, noopApplyPayoutUpdate, deps, evt);

    expect(first.settlementCorrected).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.settlementCorrected).toBe(false);
    // 反映は1回だけ（二重遷移しない）
    expect(applySettlementCorrection).toHaveBeenCalledTimes(1);
  });
});

// --- MAJOR-5: 冪等記録と業務処理の分離（イベントの恒久ロスト防止） ---

describe("webhook.service 業務処理の失敗と再送（processed_at の契約）", () => {
  it("業務処理が成功したら markEventProcessed で処理済みを刻む", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_mark"),
    );

    // 成功時は処理済みマークが1回呼ばれる
    expect(repo.markEventProcessed).toHaveBeenCalledWith("evt_mark");
  });

  it("業務処理が失敗したら処理済みにせず、再送（同一イベント ID）で再処理できる", async () => {
    const repo = makeWebhookRepo();
    // 1回目は業務処理（tip 更新）が失敗し、2回目（再送）は成功するモック
    let calls = 0;
    const byTipId = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("db down");
      return 1;
    });
    const update = { byTipId, byPaymentIntentId: vi.fn(async () => 0) };

    // 1回目: 業務処理が失敗 → 例外が伝播し、処理済みマークは付かない
    await expect(
      handleStripeWebhook(
        repo,
        update,
        noopApplyAccountUpdate,
        noopApplyPayoutUpdate,
        noopSettlementDeps,
        succeededEvent("evt_retry"),
      ),
    ).rejects.toThrow("db down");
    expect(repo.markEventProcessed).not.toHaveBeenCalled();

    // 2回目（Stripe の再送）: duplicate 扱いにならず再処理され、今度は成功して処理済みになる
    const second = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_retry"),
    );
    expect(second.duplicate).toBe(false);
    expect(second.tipUpdated).toBe(true);
    expect(repo.markEventProcessed).toHaveBeenCalledWith("evt_retry");

    // 3回目: 処理済みの再送は冪等にスキップされ、業務処理は再実行されない
    const third = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      succeededEvent("evt_retry"),
    );
    expect(third.duplicate).toBe(true);
    expect(byTipId).toHaveBeenCalledTimes(2);
  });
});

// --- MAJOR-7: イベントの帰属口座検証（多層防御） ---

describe("webhook.service 帰属口座（eventAccountId）の引き渡し", () => {
  it("Connect スコープのイベントは発生元口座を tip 更新（主経路）へ渡す", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      { ...succeededEvent("evt_acct_scope"), eventAccountId: "acct_owner" },
    );

    // 発生元口座がそのまま渡り、Repository 側で「tip の店員の口座と一致する場合だけ」更新される
    expect(update.byTipId).toHaveBeenCalledWith("tip_1", "succeeded", "pi_1", "acct_owner");
  });

  it("従経路（PaymentIntent ID）でも発生元口座を渡す", async () => {
    const repo = makeWebhookRepo();
    const update = makeUpdateDeps(1);

    await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      {
        ...succeededEvent("evt_acct_scope_pi", { tipId: null, piId: "pi_scope" }),
        eventAccountId: "acct_owner2",
      },
    );

    expect(update.byPaymentIntentId).toHaveBeenCalledWith("pi_scope", "succeeded", "acct_owner2");
  });

  it("帰属不一致（0行更新）でも受理は成立する（tipUpdated=false・エラーにしない）", async () => {
    const repo = makeWebhookRepo();
    // Repository が帰属不一致で 0 行更新を返すケース
    const update = makeUpdateDeps(0);

    const result = await handleStripeWebhook(
      repo,
      update,
      noopApplyAccountUpdate,
      noopApplyPayoutUpdate,
      noopSettlementDeps,
      { ...succeededEvent("evt_mismatch"), eventAccountId: "acct_evil" },
    );

    // 不一致は無視（0行更新）され、イベント自体は処理済みになる（攻撃者による再送ループを作らない）
    expect(result.tipUpdated).toBe(false);
    expect(repo.markEventProcessed).toHaveBeenCalledWith("evt_mismatch");
  });
});
