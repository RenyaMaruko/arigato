import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getInviteInfo,
  getStaffMe,
  createStaffProfile,
  joinStore,
  updateStaffProfile,
  getStaffTips,
  getStaffBalance,
  getStaffTaxReport,
  startConnectOnboarding,
  applyConnectAccountUpdate,
  createStaffPayout,
  getStaffPayouts,
  applyPayoutWebhookUpdate,
  InviteNotUsableError,
  StaffAlreadyExistsError,
  StaffNotFoundError,
  PayoutNotVerifiedError,
  PayoutBelowMinimumError,
} from "./staff.service.js";
import { buildTipUrl } from "./staff.model.js";
import type {
  StaffRepository,
  InviteRow,
  StaffProfileRow,
  StaffMembershipRow,
  StaffTipRow,
  SettlementRow,
  JoinResultRow,
} from "./staff.repository.js";

/**
 * staff Service のテスト（多対多モデル）。
 * staff（人）はプロフィールを1つ持ち、所属（membership）を複数持てる（掛け持ち）。
 * 参加の確定点は join（招待コードで staff_store を追加）に集約する。
 *
 * 検証する契約:
 * - プロフィール作成は display_name / headline のみ（本人確認なしで成立・多重作成不可）
 * - 参加（join）: 新規 staff_store を作る（joined）/ 同店所属済みは already_member / 招待無効は弾く
 * - getStaffMe は memberships（店ごとQR用URL 付き）を返す・本人スコープ
 * - 受取履歴・残高は人ごと集約・本人スコープ・店ラベル付き
 * - Connect オンボーディング・account.updated（held→payable 遷移・冪等）
 */

// 受取履歴の拡張型（送金検証のため payoutId 追跡を足したもの。既存シードを壊さないため任意）
type TestTip = StaffTipRow & { payoutId?: string | null };
// 送金（payout）の内部表現
type TestPayout = {
  id: string;
  staffId: string;
  authUserId: string;
  amount: number;
  status: "pending" | "paid" | "failed";
  // 作成時は NULL（Stripe 成功後に補完）。実 DB の挙動を模す
  stripePayoutId: string | null;
  createdAt: string;
  arrivedAt: string | null;
  failureReason: string | null;
};

// テスト用のモック Repository（実 DB を使わず Service のロジックを検証する・多対多）
function createMockRepo() {
  const invites = new Map<string, InviteRow>();
  const staffByAuth = new Map<string, StaffProfileRow>();
  // authUserId → 所属（membership）一覧
  const membershipsByAuth = new Map<string, StaffMembershipRow[]>();
  // authUserId → 受取履歴（本人スコープを検証するため auth ごとに分けて保持）。
  // 送金検証用に id・payoutId を含む拡張型で保持する（StaffTipRow に追跡用フィールドを足したもの）。
  const tipsByAuth = new Map<string, TestTip[]>();
  // authUserId → Connected Account ID
  const accountByAuth = new Map<string, string | null>();
  // staffId（人）→ authUserId（payout 反映時に本人を逆引きするため）
  const authByStaffId = new Map<string, string>();
  // payout（送金）の簡易ストア（payoutId をキー）
  const payoutsByStaff = new Map<string, TestPayout>();
  // membership ID の採番カウンタ
  let membershipSeq = 0;
  // payout ID の採番カウンタ
  let payoutSeq = 0;

  const repo: StaffRepository = {
    async findInviteByCode(code) {
      return invites.get(code) ?? null;
    },
    async findStaffByAuthUserId(authUserId) {
      return staffByAuth.get(authUserId) ?? null;
    },
    async listMembershipsByAuthUserId(authUserId) {
      return membershipsByAuth.get(authUserId) ?? [];
    },
    // プロフィール（人ごと1つ）を作成する。所属は含めない
    async createStaffProfile(params) {
      const row: StaffProfileRow = {
        id: `staff-${params.authUserId}`,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
        // 本人確認なしで成立するため none のまま
        identityStatus: "none",
      };
      staffByAuth.set(params.authUserId, row);
      accountByAuth.set(params.authUserId, null);
      membershipsByAuth.set(params.authUserId, []);
      // staffId → authUserId の逆引きを登録（payout 反映で使う）
      authByStaffId.set(row.id, params.authUserId);
      return row;
    },
    // 招待コードで所属（staff_store）を追加する（参加の確定点）。
    // 招待検証・同店重複・新規作成・招待消費を1まとまりで担保する。
    async joinStoreByInvite(authUserId, code) {
      const invite = invites.get(code);
      if (!invite || invite.inviteStatus !== "pending" || !invite.storeAdopted) {
        throw new Error("invite_not_usable");
      }
      const staff = staffByAuth.get(authUserId);
      if (!staff) {
        throw new Error("staff_not_found");
      }
      const current = membershipsByAuth.get(authUserId) ?? [];
      // 既に同じ店に所属していれば already_member（招待は消費しない）
      const existing = current.find((m) => m.storeId === invite.storeId);
      if (existing) {
        return {
          outcome: "already_member",
          membershipId: existing.membershipId,
          storeId: existing.storeId,
          storeName: existing.storeName,
        } satisfies JoinResultRow;
      }
      // 新規所属を作成する
      membershipSeq += 1;
      const membershipId = `membership-${membershipSeq}`;
      const next = [
        ...current,
        { membershipId, storeId: invite.storeId, storeName: invite.storeName },
      ];
      membershipsByAuth.set(authUserId, next);
      // 招待を消費する
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      return {
        outcome: "joined",
        membershipId,
        storeId: invite.storeId,
        storeName: invite.storeName,
      } satisfies JoinResultRow;
    },
    async updateStaffProfile(authUserId, params) {
      const existing = staffByAuth.get(authUserId);
      if (!existing) return null;
      const updated = { ...existing, ...params };
      staffByAuth.set(authUserId, updated);
      return updated;
    },
    async findStaffConnect(authUserId) {
      const profile = staffByAuth.get(authUserId);
      if (!profile) return null;
      return {
        id: profile.id,
        displayName: profile.displayName,
        stripeAccountId: accountByAuth.get(authUserId) ?? null,
        identityStatus: profile.identityStatus,
      };
    },
    async setStripeAccountId(authUserId, stripeAccountId) {
      accountByAuth.set(authUserId, stripeAccountId);
    },
    // 本人スコープ: その authUserId の履歴のみ返す
    async listTipsByAuthUserId(authUserId) {
      return tipsByAuth.get(authUserId) ?? [];
    },
    // 本人スコープ: その authUserId の settlement のみ返す
    async listSettlementsByAuthUserId(authUserId) {
      const tips = tipsByAuth.get(authUserId) ?? [];
      return tips.map<SettlementRow>((t) => ({
        amount: t.amount,
        settlementStatus: t.settlementStatus,
      }));
    },
    async listTaxRecordsByAuthUserId(authUserId) {
      const tips = tipsByAuth.get(authUserId) ?? [];
      return tips.map((t) => ({
        receivedDate: t.receivedAt.slice(0, 10),
        amount: t.amount,
        storeName: t.storeName,
      }));
    },
    async applyAccountUpdate(stripeAccountId, payoutsEnabled) {
      // Stripe Account ID で本人を逆引きする
      let foundAuth: string | null = null;
      for (const [authUserId, acct] of accountByAuth) {
        if (acct === stripeAccountId) {
          foundAuth = authUserId;
          break;
        }
      }
      if (!foundAuth) return { found: false, verified: false, promotedTips: 0 };
      const profile = staffByAuth.get(foundAuth)!;
      if (!payoutsEnabled) {
        return { found: true, verified: profile.identityStatus === "verified", promotedTips: 0 };
      }
      if (profile.identityStatus === "verified") {
        return { found: true, verified: true, promotedTips: 0 };
      }
      // verified へ確定し、held を payable へ昇格する（人ごと・全所属店分まとめて）
      staffByAuth.set(foundAuth, { ...profile, identityStatus: "verified" });
      const tips = tipsByAuth.get(foundAuth) ?? [];
      let promoted = 0;
      const next = tips.map((t) => {
        if (t.settlementStatus === "held") {
          promoted += 1;
          return { ...t, settlementStatus: "payable" as const };
        }
        return t;
      });
      tipsByAuth.set(foundAuth, next);
      return { found: true, verified: true, promotedTips: promoted };
    },

    // 送金（payout）の本人・Connect 連携状態を返す
    async findPayoutContext(authUserId) {
      const profile = staffByAuth.get(authUserId);
      if (!profile) return null;
      return {
        staffId: profile.id,
        stripeAccountId: accountByAuth.get(authUserId) ?? null,
        identityStatus: profile.identityStatus,
      };
    },
    // 本人の着金可能（payable）な tip の id・額面を返す（本人スコープ）。tip に id を採番して返す
    async listPayableTipsByAuthUserId(authUserId) {
      const tips = tipsByAuth.get(authUserId) ?? [];
      return tips
        .filter((t) => t.settlementStatus === "payable")
        .map((t) => ({ tipId: t.id, amount: t.amount }));
    },
    // 【DB 先行記録】送金記録を pending（stripe_payout_id は NULL）で作り、
    // 対象 tip を paid＋payout_id 紐付けへ更新する（Stripe 呼び出し前に DB を確定させる）
    async createPendingPayoutAndMarkTipsPaid(params) {
      payoutSeq += 1;
      const id = `payout-${payoutSeq}`;
      payoutsByStaff.set(id, {
        id,
        staffId: params.staffId,
        authUserId: authByStaffId.get(params.staffId)!,
        amount: params.amount,
        status: "pending",
        // Stripe 成功後に attachStripePayoutId で補完するため、ここでは NULL
        stripePayoutId: null,
        createdAt: new Date().toISOString(),
        arrivedAt: null,
        failureReason: null,
      });
      // 対象の payable な tip を paid＋紐付けへ
      const auth = authByStaffId.get(params.staffId)!;
      const tips = tipsByAuth.get(auth) ?? [];
      const next = tips.map((t) =>
        params.tipIds.includes(t.id) && t.settlementStatus === "payable"
          ? { ...t, settlementStatus: "paid" as const, payoutId: id }
          : t,
      );
      tipsByAuth.set(auth, next);
      return { id, amount: params.amount, status: "pending" as const };
    },
    // 【Stripe 成功後】payout 行に stripe_payout_id を補完する（status は pending のまま）
    async attachStripePayoutId(payoutId, stripePayoutId) {
      const p = payoutsByStaff.get(payoutId);
      if (p) p.stripePayoutId = stripePayoutId;
    },
    // 【Stripe 失敗時の revert】payout 行を failed にし、対象 tip を payable へ戻す（自前 id で照合）
    async revertPayoutByPayoutId(payoutId, failureReason) {
      const p = payoutsByStaff.get(payoutId);
      if (!p) return;
      p.status = "failed";
      p.failureReason = failureReason;
      const tips = tipsByAuth.get(p.authUserId) ?? [];
      tipsByAuth.set(
        p.authUserId,
        tips.map((t) =>
          t.payoutId === p.id && t.settlementStatus === "paid"
            ? { ...t, settlementStatus: "payable" as const, payoutId: null }
            : t,
        ),
      );
    },
    // 本人の送金履歴を新しい順に返す（本人スコープ）
    async listPayoutsByAuthUserId(authUserId) {
      return [...payoutsByStaff.values()]
        .filter((p) => p.authUserId === authUserId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((p) => ({
          id: p.id,
          amount: p.amount,
          status: p.status,
          createdAt: p.createdAt,
          arrivedAt: p.arrivedAt,
          failureReason: p.failureReason,
        }));
    },
    // payout.paid を反映する（stripe_payout_id を主・自前 id を従に照合・冪等）
    async markPayoutPaid(match, arrivedAt) {
      for (const p of payoutsByStaff.values()) {
        const hit =
          (p.stripePayoutId !== null && p.stripePayoutId === match.stripePayoutId) ||
          (match.payoutId !== null && p.id === match.payoutId);
        if (hit && p.status !== "paid") {
          p.status = "paid";
          // stripe_payout_id 未補完なら今回の Stripe Payout ID で埋める（バックアップ経路）
          if (p.stripePayoutId === null) p.stripePayoutId = match.stripePayoutId;
          p.arrivedAt = arrivedAt.toISOString();
          return true;
        }
      }
      return false;
    },
    // payout.failed を反映し、対象 tip を payable へ戻す（stripe_payout_id を主・自前 id を従に照合・冪等）
    async markPayoutFailedAndRevertTips(match, failureReason) {
      for (const p of payoutsByStaff.values()) {
        const hit =
          (p.stripePayoutId !== null && p.stripePayoutId === match.stripePayoutId) ||
          (match.payoutId !== null && p.id === match.payoutId);
        if (hit && p.status !== "failed") {
          p.status = "failed";
          if (p.stripePayoutId === null) p.stripePayoutId = match.stripePayoutId;
          p.failureReason = failureReason;
          // この payout で paid になった tip を payable へ戻す
          const tips = tipsByAuth.get(p.authUserId) ?? [];
          tipsByAuth.set(
            p.authUserId,
            tips.map((t) =>
              t.payoutId === p.id && t.settlementStatus === "paid"
                ? { ...t, settlementStatus: "payable" as const, payoutId: null }
                : t,
            ),
          );
          return true;
        }
      }
      return false;
    },
    // (d)(f) 照合台帳まわりは本テストでは検証対象外（送金・参加フローのテスト）。最小実装で契約を満たす。
    async findPayoutForLedger(params) {
      for (const p of payoutsByStaff.values()) {
        const hit =
          (p.stripePayoutId !== null && p.stripePayoutId === params.stripePayoutId) ||
          (params.payoutId !== null && p.id === params.payoutId);
        if (hit) {
          return {
            payoutId: p.id,
            stripePayoutId: p.stripePayoutId,
            connectedAccountId: accountByAuth.get(p.authUserId) ?? null,
          };
        }
      }
      return null;
    },
    async listPaidTipsForPayout() {
      return [];
    },
    async findTipIdByChargeId() {
      return null;
    },
    async appendPayoutLedgerEntries() {
      return 0;
    },
    async appendLedgerCorrection() {
      return "ledger-correction-id";
    },
    async listReconcileTotalsByStaff() {
      return [];
    },
  };

  return { repo, invites, staffByAuth, membershipsByAuth, tipsByAuth, accountByAuth, payoutsByStaff };
}

// QR用URL の組み立て（ローカルのベース URL を使う・membership 単位）
const buildUrl = (membershipId: string) => buildTipUrl("http://localhost:5173", membershipId);

// テスト用の連結アカウント作成（infrastructure のスタブ）。呼び出し回数と引数を記録できる vi.fn。
// 既定は charges_enabled=true の連結アカウントを返す（本人確認前でも受け取れる状態を模す）。
function makeCreateConnectedAccount() {
  let seq = 0;
  return vi.fn(async (_displayName: string) => {
    seq += 1;
    return { connectedAccountId: `acct_test_${seq}`, chargesEnabled: true };
  });
}

// プロフィール作成＋参加までを一気に行うヘルパ（新規ユーザーの典型フロー）
async function setupAndJoin(
  mock: ReturnType<typeof createMockRepo>,
  authUserId: string,
  displayName: string,
  code: string,
) {
  await createStaffProfile(mock.repo, buildUrl, makeCreateConnectedAccount(), authUserId, {
    displayName,
  });
  return joinStore(mock.repo, buildUrl, authUserId, code);
}

describe("staff.service", () => {
  let mock: ReturnType<typeof createMockRepo>;

  beforeEach(() => {
    mock = createMockRepo();
    // 承認済み店の pending 招待を1件用意する
    mock.invites.set("INV-OK", {
      code: "INV-OK",
      storeId: "store-1",
      storeName: "カフェ Arigato",
      inviteStatus: "pending",
      storeAdopted: true,
    });
    // 別の承認済み店の pending 招待（掛け持ち検証用）
    mock.invites.set("INV-BAR", {
      code: "INV-BAR",
      storeId: "store-bar",
      storeName: "バー Arigato",
      inviteStatus: "pending",
      storeAdopted: true,
    });
    // 店が未承認の招待（使えないはず）
    mock.invites.set("INV-STORE-PENDING", {
      code: "INV-STORE-PENDING",
      storeId: "store-2",
      storeName: "未承認の店",
      inviteStatus: "pending",
      storeAdopted: false,
    });
  });

  // --- 招待検証 ---

  it("getInviteInfo: 承認済み店の pending 招待は valid=true で店名を返す", async () => {
    const info = await getInviteInfo(mock.repo, "INV-OK");
    expect(info).not.toBeNull();
    expect(info!.storeName).toBe("カフェ Arigato");
    expect(info!.storeId).toBe("store-1");
    expect(info!.valid).toBe(true);
  });

  it("getInviteInfo: 店未承認の招待は valid=false", async () => {
    const info = await getInviteInfo(mock.repo, "INV-STORE-PENDING");
    expect(info!.valid).toBe(false);
  });

  it("getInviteInfo: 存在しない招待は null", async () => {
    expect(await getInviteInfo(mock.repo, "NOPE")).toBeNull();
  });

  // --- プロフィール作成（display_name / headline のみ・本人確認なし・多重不可） ---

  it("createStaffProfile: display_name / headline のみで本人確認なし（identity_status=none）で成立し、所属はまだ無い", async () => {
    const createAccount = makeCreateConnectedAccount();
    const me = await createStaffProfile(mock.repo, buildUrl, createAccount, "auth-user-1", {
      displayName: "山田 さくら",
      headline: "カフェで働いています",
    });
    expect(me.displayName).toBe("山田 さくら");
    expect(me.headline).toBe("カフェで働いています");
    // 本人確認・口座登録なしで成立 → none のまま
    expect(me.identityStatus).toBe("none");
    // 作成直後は所属が無い（参加は join で行う）
    expect(me.memberships).toHaveLength(0);
  });

  it("createStaffProfile: 連結アカウントを自動作成し stripe_account_id を保存する（受け取り前倒し・人ごと1つ）", async () => {
    const createAccount = makeCreateConnectedAccount();
    await createStaffProfile(mock.repo, buildUrl, createAccount, "auth-user-1", {
      displayName: "山田 さくら",
    });
    // プロフィール作成に続けて連結アカウントが1回だけ作られる（表示名を渡す）
    expect(createAccount).toHaveBeenCalledTimes(1);
    expect(createAccount).toHaveBeenCalledWith("山田 さくら");
    // 保存された連結アカウントが Connect 連携状態に反映される（本人確認前でも受け取れる土台）
    const connect = await mock.repo.findStaffConnect("auth-user-1");
    expect(connect!.stripeAccountId).toBe("acct_test_1");
    // identity_status は none のまま（送金＝payout は本人確認後）
    expect(connect!.identityStatus).toBe("none");
  });

  it("createStaffProfile: 連結アカウント作成が失敗してもプロフィール作成は成立する（体験を止めない）", async () => {
    // 連結アカウント作成が失敗するスタブ（Stripe 障害を模す）
    const failing = vi.fn(async () => {
      throw new Error("stripe down");
    });
    const me = await createStaffProfile(mock.repo, buildUrl, failing, "auth-user-1", {
      displayName: "山田 さくら",
    });
    // プロフィール自体は作成済み
    expect(me.displayName).toBe("山田 さくら");
    // 連結アカウントは未保存（後追いで onboarding / tip 側が作る）
    const connect = await mock.repo.findStaffConnect("auth-user-1");
    expect(connect!.stripeAccountId).toBeNull();
  });

  it("createStaffProfile: 既にプロフィールがあると多重作成できない（StaffAlreadyExistsError）", async () => {
    const createAccount = makeCreateConnectedAccount();
    await createStaffProfile(mock.repo, buildUrl, createAccount, "auth-user-1", {
      displayName: "山田 さくら",
    });
    // 同じ auth ユーザーが再度作成しようとすると弾かれる
    await expect(
      createStaffProfile(mock.repo, buildUrl, createAccount, "auth-user-1", { displayName: "別名" }),
    ).rejects.toBeInstanceOf(StaffAlreadyExistsError);
    // 連結アカウントは最初の1回のみ（多重作成時は再作成しない＝冪等）
    expect(createAccount).toHaveBeenCalledTimes(1);
  });

  // --- 参加（join）: 新規 / 同店重複 / 招待無効 / プロフィール未作成 ---

  it("joinStore: 招待コードで所属（membership）を1件作り joined を返す。QR用URLは /tip/:membershipId", async () => {
    await createStaffProfile(mock.repo, buildUrl, makeCreateConnectedAccount(), "auth-user-1", {
      displayName: "山田 さくら",
    });
    const result = await joinStore(mock.repo, buildUrl, "auth-user-1", "INV-OK");
    expect(result.status).toBe("joined");
    expect(result.storeId).toBe("store-1");
    expect(result.storeName).toBe("カフェ Arigato");
    // QR用URL が /tip/:membershipId を指す
    expect(result.tipUrl).toBe(`http://localhost:5173/tip/${result.membershipId}`);
    // 招待は消費される（accepted）
    expect(mock.invites.get("INV-OK")!.inviteStatus).toBe("accepted");
    // 所属一覧に1件入る
    const me = await getStaffMe(mock.repo, buildUrl, "auth-user-1");
    expect(me!.memberships).toHaveLength(1);
    expect(me!.memberships[0]!.storeName).toBe("カフェ Arigato");
  });

  it("joinStore: 掛け持ち — 別の店の招待でもう1件所属が増える（複数 membership）", async () => {
    await setupAndJoin(mock, "auth-user-1", "山田 さくら", "INV-OK");
    const second = await joinStore(mock.repo, buildUrl, "auth-user-1", "INV-BAR");
    expect(second.status).toBe("joined");
    expect(second.storeName).toBe("バー Arigato");
    // 2店に所属する（掛け持ち）
    const me = await getStaffMe(mock.repo, buildUrl, "auth-user-1");
    expect(me!.memberships).toHaveLength(2);
    const names = me!.memberships.map((m) => m.storeName).sort();
    expect(names).toEqual(["カフェ Arigato", "バー Arigato"]);
    // 各 membership で QR用URL が異なる（店ごとQR）
    const urls = new Set(me!.memberships.map((m) => m.tipUrl));
    expect(urls.size).toBe(2);
  });

  it("joinStore: 同じ店の招待に再度参加しようとすると already_member（多重参加不可・招待は消費しない）", async () => {
    await setupAndJoin(mock, "auth-user-1", "山田 さくら", "INV-OK");
    // 同じ店の別招待コードを用意する
    mock.invites.set("INV-OK-2", {
      code: "INV-OK-2",
      storeId: "store-1",
      storeName: "カフェ Arigato",
      inviteStatus: "pending",
      storeAdopted: true,
    });
    const again = await joinStore(mock.repo, buildUrl, "auth-user-1", "INV-OK-2");
    expect(again.status).toBe("already_member");
    expect(again.storeId).toBe("store-1");
    // 招待は消費されない（pending のまま）
    expect(mock.invites.get("INV-OK-2")!.inviteStatus).toBe("pending");
    // 所属は増えない（1件のまま）
    const me = await getStaffMe(mock.repo, buildUrl, "auth-user-1");
    expect(me!.memberships).toHaveLength(1);
  });

  it("joinStore: 店未承認の招待では参加できない（InviteNotUsableError）", async () => {
    await createStaffProfile(mock.repo, buildUrl, makeCreateConnectedAccount(), "auth-user-1", {
      displayName: "誰か",
    });
    await expect(
      joinStore(mock.repo, buildUrl, "auth-user-1", "INV-STORE-PENDING"),
    ).rejects.toBeInstanceOf(InviteNotUsableError);
  });

  it("joinStore: 存在しない招待では参加できない（InviteNotUsableError）", async () => {
    await createStaffProfile(mock.repo, buildUrl, makeCreateConnectedAccount(), "auth-user-1", {
      displayName: "誰か",
    });
    await expect(
      joinStore(mock.repo, buildUrl, "auth-user-1", "NOPE"),
    ).rejects.toBeInstanceOf(InviteNotUsableError);
  });

  it("joinStore: プロフィール未作成なら参加できない（StaffNotFoundError）", async () => {
    await expect(
      joinStore(mock.repo, buildUrl, "no-staff", "INV-OK"),
    ).rejects.toBeInstanceOf(StaffNotFoundError);
  });

  // --- getStaffMe（本人スコープ・memberships を返す） ---

  it("getStaffMe: 本人スコープ — 自分の行のみ返り、他人の authUserId では取得できない", async () => {
    await setupAndJoin(mock, "auth-user-1", "山田 さくら", "INV-OK");
    // 本人なら取得できる
    const me = await getStaffMe(mock.repo, buildUrl, "auth-user-1");
    expect(me).not.toBeNull();
    expect(me!.displayName).toBe("山田 さくら");
    expect(me!.memberships).toHaveLength(1);
    // 他人の authUserId では何も返らない（自分のスコープのみ）
    const other = await getStaffMe(mock.repo, buildUrl, "auth-user-OTHER");
    expect(other).toBeNull();
  });

  it("getStaffMe: プロフィール未作成なら null（フロントは作成へ誘導）", async () => {
    expect(await getStaffMe(mock.repo, buildUrl, "no-staff")).toBeNull();
  });

  // --- プロフィール編集（所属は変わらない） ---

  it("updateStaffProfile: 本人の display_name / headline を更新でき、所属は変わらない", async () => {
    await setupAndJoin(mock, "auth-user-1", "山田 さくら", "INV-OK");
    const updated = await updateStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      displayName: "山田 さくら",
      headline: "新しい一言☕",
    });
    expect(updated!.headline).toBe("新しい一言☕");
    // 所属は招待で確定した1件のまま
    expect(updated!.memberships).toHaveLength(1);
    expect(updated!.memberships[0]!.storeName).toBe("カフェ Arigato");
  });

  it("updateStaffProfile: プロフィール未作成なら null", async () => {
    const res = await updateStaffProfile(mock.repo, buildUrl, "no-staff", {
      displayName: "x",
    });
    expect(res).toBeNull();
  });

  // --- 受取履歴・保留残高（金額は本人のみ・人ごと集約） ---

  // 2人の店員さんに別々の受取履歴を仕込むヘルパ
  async function seedTwoStaffWithTips() {
    await setupAndJoin(mock, "auth-A", "Aさん", "INV-OK");
    await setupAndJoin(mock, "auth-B", "Bさん", "INV-BAR");
    // A の履歴: held 300 + held 500、B の履歴: held 100
    mock.tipsByAuth.set("auth-A", [
      {
        id: "11111111-1111-1111-1111-111111111111",
        amount: 300,
        message: "ありがとう",
        receivedAt: "2025-05-15T10:32:00Z",
        storeName: "カフェ Arigato",
        settlementStatus: "held",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        amount: 500,
        message: null,
        receivedAt: "2025-05-14T03:10:00Z",
        storeName: "カフェ Arigato",
        settlementStatus: "held",
      },
    ]);
    mock.tipsByAuth.set("auth-B", [
      {
        id: "33333333-3333-3333-3333-333333333333",
        amount: 100,
        message: "助かりました",
        receivedAt: "2025-05-13T08:00:00Z",
        storeName: "バー Arigato",
        settlementStatus: "held",
      },
    ]);
  }

  it("getStaffTips: 本人の受取履歴を金額・メッセージ・受取日時・店ラベルつきで返し、合計も返す", async () => {
    await seedTwoStaffWithTips();
    const tips = await getStaffTips(mock.repo, "auth-A");
    expect(tips).not.toBeNull();
    expect(tips!.items).toHaveLength(2);
    // 手取り型: 額面300/500 → 手取り floor(255)/floor(425)=255/425、合計680（手数料15%・決済料込み）
    expect(tips!.totalAmount).toBe(255 + 425);
    // 金額（手取り）・メッセージ・受取日時・店ラベルを含む
    expect(tips!.items[0]!.amount).toBe(255);
    expect(tips!.items[0]!.message).toBe("ありがとう");
    expect(tips!.items[0]!.receivedAt).toBe("2025-05-15T10:32:00Z");
    expect(tips!.items[0]!.storeName).toBe("カフェ Arigato");
  });

  it("getStaffTips: 本人スコープ — 他人の履歴・金額は混ざらない", async () => {
    await seedTwoStaffWithTips();
    const a = await getStaffTips(mock.repo, "auth-A");
    const b = await getStaffTips(mock.repo, "auth-B");
    // A は自分の2件・合計680（手取り）のみ。B の分は混ざらない
    expect(a!.totalAmount).toBe(255 + 425);
    expect(a!.items.map((i) => i.id)).not.toContain("33333333-3333-3333-3333-333333333333");
    // B は自分の1件・額面100 → 手取り floor(85)=85 のみ
    expect(b!.totalAmount).toBe(85);
    expect(b!.items).toHaveLength(1);
  });

  it("getStaffTips: プロフィール未作成なら null（金額を漏らさない）", async () => {
    expect(await getStaffTips(mock.repo, "no-staff")).toBeNull();
  });

  it("getStaffBalance: held 合計（保留残高）と着金可能額を本人に返す（人ごと集約）", async () => {
    await seedTwoStaffWithTips();
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(balance).not.toBeNull();
    // 手取り型: 本人確認前のため held=手取り合計680（255+425） / payable=0、canPayout=false
    expect(balance!.heldAmount).toBe(255 + 425);
    expect(balance!.payableAmount).toBe(0);
    expect(balance!.canPayout).toBe(false);
    expect(balance!.identityStatus).toBe("none");
  });

  it("getStaffBalance: 本人スコープ — 他人の残高は見えない", async () => {
    await seedTwoStaffWithTips();
    const b = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-B");
    // B の保留残高は自分の額面100 → 手取り floor(85)=85 のみ（A の分は混ざらない）
    expect(b!.heldAmount).toBe(85);
  });

  it("getStaffTaxReport: 受取日 / 金額 / 店名 を含む CSV を返す", async () => {
    await seedTwoStaffWithTips();
    const csv = await getStaffTaxReport(mock.repo, "auth-A", 2025);
    expect(csv).not.toBeNull();
    expect(csv!).toContain("受取日,金額,店名");
    // 手取り型: CSV の金額は店員手取り（額面300 → floor(255)=255）
    expect(csv!).toContain("2025-05-15,255,カフェ Arigato");
  });

  // --- Connect オンボーディング ---

  it("startConnectOnboarding: 既存の連結アカウント（プロフィール作成時に自動作成）に対してリンクを発行する", async () => {
    await setupAndJoin(mock, "auth-A", "Aさん", "INV-OK");
    // プロフィール作成時に連結アカウントが自動作成済みであることを確認（受け取り前倒しの土台）
    const before = await mock.repo.findStaffConnect("auth-A");
    expect(before!.stripeAccountId).not.toBeNull();
    const existingAccountId = before!.stripeAccountId!;

    // 既存アカウントに対してオンボーディングリンクを返す infrastructure をモック
    const createLink = vi.fn(async () => ({
      onboardingUrl: "https://connect.stripe.com/setup/existing",
      connectedAccountId: existingAccountId,
    }));
    const buildUrls = () => ({
      returnUrl: "http://localhost:5173/staff/identity/complete",
      refreshUrl: "http://localhost:5173/staff/balance",
    });

    const result = await startConnectOnboarding(mock.repo, createLink, buildUrls, "auth-A");
    expect(result).not.toBeNull();
    expect(result!.onboardingUrl).toBe("https://connect.stripe.com/setup/existing");
    // 既に連結済みなので、その既存アカウント ID を渡す（人ごと1つ・新規作成しない）
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: existingAccountId, staffDisplayName: "Aさん" }),
    );
    // アカウント ID は変わらない（再作成されない）
    const after = await mock.repo.findStaffConnect("auth-A");
    expect(after!.stripeAccountId).toBe(existingAccountId);
  });

  it("startConnectOnboarding: プロフィール未作成なら null", async () => {
    const createLink = vi.fn(async () => ({
      onboardingUrl: "https://connect.stripe.com/x",
      connectedAccountId: "acct_x",
    }));
    const res = await startConnectOnboarding(
      mock.repo,
      createLink,
      () => ({ returnUrl: "r", refreshUrl: "f" }),
      "no-staff",
    );
    expect(res).toBeNull();
    expect(createLink).not.toHaveBeenCalled();
  });

  // --- account.updated 反映（本人確認→着金の遷移・冪等性） ---

  it("applyConnectAccountUpdate: payouts_enabled=true で verified にし held→payable へ遷移する", async () => {
    await seedTwoStaffWithTips();
    // A の連結アカウントはプロフィール作成時に自動作成済み。その実 ID で account.updated を発火させる。
    const connect = await mock.repo.findStaffConnect("auth-A");
    const acctA = connect!.stripeAccountId!;

    const result = await applyConnectAccountUpdate(mock.repo, acctA, true);
    expect(result.found).toBe(true);
    expect(result.verified).toBe(true);
    // A の held 2件が payable へ昇格する
    expect(result.promotedTips).toBe(2);

    // 残高は held=0 / payable=手取り合計680（255+425）、本人確認は verified になる
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(balance!.heldAmount).toBe(0);
    expect(balance!.payableAmount).toBe(255 + 425);
    expect(balance!.canPayout).toBe(true);
    expect(balance!.identityStatus).toBe("verified");
  });

  it("applyConnectAccountUpdate: 冪等 — 2回目は二重遷移しない（promotedTips=0）", async () => {
    await seedTwoStaffWithTips();
    // 連結アカウントはプロフィール作成時に自動作成済み。その実 ID で2回 account.updated を発火させる。
    const connect = await mock.repo.findStaffConnect("auth-A");
    const acctA = connect!.stripeAccountId!;

    const first = await applyConnectAccountUpdate(mock.repo, acctA, true);
    const second = await applyConnectAccountUpdate(mock.repo, acctA, true);
    expect(first.promotedTips).toBe(2);
    // 既に verified のため二重遷移しない
    expect(second.verified).toBe(true);
    expect(second.promotedTips).toBe(0);
    // payable は手取り合計680のまま（二重加算されない）
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(balance!.payableAmount).toBe(255 + 425);
  });

  it("applyConnectAccountUpdate: 該当口座が無ければ found=false", async () => {
    const res = await applyConnectAccountUpdate(mock.repo, "acct_unknown", true);
    expect(res.found).toBe(false);
    expect(res.promotedTips).toBe(0);
  });

  // --- 送金（payout）---

  // A を verified にして payable な tip を用意するヘルパ（送金検証の前提を整える）。
  // 連結アカウントはプロフィール作成時に自動作成済み（seedTwoStaffWithTips 経由）。
  // オンボーディングは既存アカウントに対してリンクを発行するだけ（人ごと1つ・再作成しない）。
  // 本人確認の完了は account.updated（payouts_enabled=true）で表す＝その実際の口座 ID で発火させる。
  async function setupVerifiedWithPayable() {
    await seedTwoStaffWithTips();
    await startConnectOnboarding(
      mock.repo,
      async () => ({
        onboardingUrl: "https://connect.stripe.com/x",
        // 既存アカウントがあるため Service はこの値で上書きしない（人ごと1つ）。
        connectedAccountId: "acct_unused",
      }),
      () => ({ returnUrl: "r", refreshUrl: "f" }),
      "auth-A",
    );
    // A の連結アカウント（プロフィール作成時に自動作成された実 ID）を取得する
    const connect = await mock.repo.findStaffConnect("auth-A");
    // account.updated で verified へ → A の held 2件（額面300/500）が payable（手取り 255+425=680）へ
    await applyConnectAccountUpdate(mock.repo, connect!.stripeAccountId!, true);
  }

  // テスト用の Stripe payout 実行（呼ばれた額を記録し、指定の payout ID を返す）
  function makeStripePayout(payoutId = "po_test_1") {
    return vi.fn(
      async (_params: {
        connectedAccountId: string;
        amount: number;
        currency: string;
        idempotencyKey: string;
        payoutId: string;
      }) => ({
        payoutId,
      }),
    );
  }

  // テスト用の Stripe 残高取得（送金可能額の正＝ Stripe available）。
  // available を引数で指定でき、available 基準の送金可能額・送金上限の検証に使う。
  // 既定は十分大きい（DB payable をすべて送れる）available にして「全額送金」の従来契約を保つ。
  function makeGetConnectBalance(
    available = 1_000_000,
    pending = 0,
    nextAvailableOn: string | null = null,
  ) {
    return vi.fn(async (_connectedAccountId: string) => ({
      availableAmount: available,
      pendingAmount: pending,
      nextAvailableOn,
    }));
  }

  it("createStaffPayout: verified＋payable があれば全額（手取り合計）を送金し、tip を paid にする", async () => {
    await setupVerifiedWithPayable();
    // A の連結アカウント（プロフィール作成時に自動作成された実 ID）を送金先として検証する
    const connectA = await mock.repo.findStaffConnect("auth-A");
    const acctA = connectA!.stripeAccountId!;
    const stripePayout = makeStripePayout();

    const result = await createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-A");
    expect(result).not.toBeNull();
    // 送金額は payable な tip の手取り合計（255+425=680）。全額送金（部分送金なし）
    expect(result!.amount).toBe(680);
    expect(result!.status).toBe("pending");
    // Stripe payout は Connected Account 上で手取り合計を送金する。
    // idempotencyKey・payoutId（metadata 用）には自前 payout 行の id（= result.id）を渡す（二重送金防止／Webhook 照合）。
    expect(stripePayout).toHaveBeenCalledWith({
      connectedAccountId: acctA,
      amount: 680,
      currency: "jpy",
      idempotencyKey: result!.id,
      payoutId: result!.id,
    });

    // 残高: payable→paid に移り、着金可能額は 0 になる（二重送金を防ぐ）
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(balance!.payableAmount).toBe(0);
    expect(balance!.paidAmount).toBe(680);

    // 送金履歴に1件（pending・680円）が現れる
    const payouts = await getStaffPayouts(mock.repo, "auth-A");
    expect(payouts!.items).toHaveLength(1);
    expect(payouts!.items[0]!.amount).toBe(680);
    expect(payouts!.items[0]!.status).toBe("pending");
  });

  it("createStaffPayout: 送金額は Stripe available を上限にキャップする（available < DB payable のとき available 分だけ送る・#5）", async () => {
    await setupVerifiedWithPayable();
    // DB の payable 手取り合計は 680（255+425）。だが Stripe の実 available は 255 しか無い状況を作る。
    // 残高不足を構造的に防ぐため、送金額は available（255）に収まる分だけになるはず。
    const stripePayout = makeStripePayout("po_capped");
    const getBalance = makeGetConnectBalance(255);

    const result = await createStaffPayout(mock.repo, stripePayout, getBalance, "auth-A");
    expect(result).not.toBeNull();
    // 送金額は available 以下（255）。DB payable の 680 全額は送らない（available 超過を避ける）
    expect(result!.amount).toBe(255);
    // Stripe へ渡す amount も 255（残高不足にならない）
    expect(stripePayout.mock.calls[0]![0].amount).toBe(255);

    // available に収まらなかった分（425）は payable のまま残る（次回 available になってから送金）
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(255), "auth-A");
    expect(balance!.payableAmount).toBe(425);
    expect(balance!.paidAmount).toBe(255);
  });

  it("createStaffPayout: available 0（全額まだ pending）なら PayoutBelowMinimumError（DB payable があっても送らない）", async () => {
    await setupVerifiedWithPayable();
    // DB payable は 680 だが Stripe available は 0（受け取ったばかりで全額 pending）。
    const stripePayout = makeStripePayout();
    const getBalance = makeGetConnectBalance(0, 680);
    await expect(
      createStaffPayout(mock.repo, stripePayout, getBalance, "auth-A"),
    ).rejects.toBeInstanceOf(PayoutBelowMinimumError);
    // available 0 のため Stripe payout は実行されない（残高不足エラーを構造的に回避）
    expect(stripePayout).not.toHaveBeenCalled();
  });

  it("createStaffPayout: 申請時点で available を再取得して上限にする（TOCTOU 回避）", async () => {
    await setupVerifiedWithPayable();
    const getBalance = makeGetConnectBalance(680);
    await createStaffPayout(mock.repo, makeStripePayout(), getBalance, "auth-A");
    // 送金実行のたびに Stripe 残高を取得している（表示時の値ではなく申請時点の available で判断する）
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it("getStaffBalance: 3段（送金できる＝Stripe available / 準備中 pending / 本人確認待ち held）を返す", async () => {
    await setupVerifiedWithPayable();
    // verified 済み。Stripe available=600 / pending=200 / 「7/1 から available」を返す状況
    const getBalance = makeGetConnectBalance(600, 200, "2026-07-01T00:00:00Z");
    const balance = await getStaffBalance(mock.repo, getBalance, "auth-A");
    expect(balance).not.toBeNull();
    // 送金できる額＝Stripe の実 available（DB payable ではない）
    expect(balance!.sendableAmount).toBe(600);
    // 準備中（pending）と available になる期日
    expect(balance!.pendingStripeAmount).toBe(200);
    expect(balance!.nextAvailableOn).toBe("2026-07-01T00:00:00Z");
    // 本人確認待ち（held）。verified 済みなので held は 0、受取総額として payable(680) は引き続き見える
    expect(balance!.heldAmount).toBe(0);
    expect(balance!.payableAmount).toBe(680);
  });

  it("getStaffBalance: 未確認（verified でない）なら Stripe 残高は取得せず sendable/pending は 0（held は見える）", async () => {
    await seedTwoStaffWithTips();
    const getBalance = makeGetConnectBalance(600, 200);
    const balance = await getStaffBalance(mock.repo, getBalance, "auth-A");
    // 未確認のため Stripe 残高は引かない（送金対象が無い）
    expect(getBalance).not.toHaveBeenCalled();
    expect(balance!.sendableAmount).toBe(0);
    expect(balance!.pendingStripeAmount).toBe(0);
    // 本人確認待ち（held）は受取総額として見える（隠さない）
    expect(balance!.heldAmount).toBe(255 + 425);
    expect(balance!.canPayout).toBe(false);
  });

  it("getStaffBalance: Stripe 残高取得が失敗しても画面を壊さない（DB 集計で代替・sendable は 0）", async () => {
    await setupVerifiedWithPayable();
    // Stripe 残高取得が落ちるケース（ネットワーク等）。例外を投げる
    const getBalance = vi.fn(async () => {
      throw new Error("stripe_unavailable");
    });
    const balance = await getStaffBalance(mock.repo, getBalance, "auth-A");
    // 例外を握りつぶし、DB 集計（payable 680）は返す。sendable は 0 にフォールバック
    expect(balance).not.toBeNull();
    expect(balance!.sendableAmount).toBe(0);
    expect(balance!.payableAmount).toBe(680);
  });

  it("createStaffPayout: verified でなければ PayoutNotVerifiedError（本人確認・口座登録が必要）", async () => {
    // verified にせず（held のまま）に送金を試みる
    await seedTwoStaffWithTips();
    const stripePayout = makeStripePayout();
    await expect(createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-A")).rejects.toBeInstanceOf(
      PayoutNotVerifiedError,
    );
    // Stripe payout は実行されない
    expect(stripePayout).not.toHaveBeenCalled();
  });

  it("createStaffPayout: 着金可能額が最低送金額未満なら PayoutBelowMinimumError", async () => {
    // verified だが payable が無い（残高0）状態を作る。
    // 連結アカウントはプロフィール作成時に自動作成済み。その実 ID で account.updated を発火させる。
    await setupAndJoin(mock, "auth-C", "Cさん", "INV-OK");
    const connectC = await mock.repo.findStaffConnect("auth-C");
    await applyConnectAccountUpdate(mock.repo, connectC!.stripeAccountId!, true);

    const stripePayout = makeStripePayout();
    await expect(createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-C")).rejects.toBeInstanceOf(
      PayoutBelowMinimumError,
    );
    expect(stripePayout).not.toHaveBeenCalled();
  });

  it("createStaffPayout: プロフィール未作成なら null", async () => {
    const stripePayout = makeStripePayout();
    const result = await createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-unknown");
    expect(result).toBeNull();
  });

  it("applyPayoutWebhookUpdate: payout.paid で着金済へ・payout.failed で paid→payable へ戻す", async () => {
    await setupVerifiedWithPayable();
    const stripePayout = makeStripePayout();
    await createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-A");

    // payout.failed → 送金失敗・対象 tip は payable へ戻る（着金可能額が復活する）
    const reverted = await applyPayoutWebhookUpdate(mock.repo, {
      kind: "failed",
      stripePayoutId: "po_test_1",
      payoutId: null,
      arrivedAt: null,
      failureReason: "account_closed",
    });
    expect(reverted).toBe(true);
    const afterFail = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(afterFail!.payableAmount).toBe(680);
    expect(afterFail!.paidAmount).toBe(0);
    const failedHistory = await getStaffPayouts(mock.repo, "auth-A");
    expect(failedHistory!.items[0]!.status).toBe("failed");
    expect(failedHistory!.items[0]!.failureReason).toBe("account_closed");

    // 再送金して payout.paid → 着金済（arrived_at 記録）。payable は再び 0 になる
    await createStaffPayout(mock.repo, makeStripePayout("po_test_2"), makeGetConnectBalance(), "auth-A");
    const paid = await applyPayoutWebhookUpdate(mock.repo, {
      kind: "paid",
      stripePayoutId: "po_test_2",
      payoutId: null,
      arrivedAt: new Date("2026-07-01T00:00:00Z"),
      failureReason: null,
    });
    expect(paid).toBe(true);
    const paidHistory = await getStaffPayouts(mock.repo, "auth-A");
    // 最新（先頭）の送金が paid・着金日時つき
    const latestPaid = paidHistory!.items.find((p) => p.status === "paid");
    expect(latestPaid).toBeTruthy();
    expect(latestPaid!.arrivedAt).not.toBeNull();
  });

  // --- 送金（payout）の堅牢化: DB 先行記録・revert・idempotency/metadata ---

  it("createStaffPayout: DB 先行記録 → その後に Stripe を呼ぶ（Stripe 呼び出し時点で tip は既に paid）", async () => {
    await setupVerifiedWithPayable();

    // Stripe payout が呼ばれた瞬間に、DB 側がもう paid になっていることを検証する。
    // 「Stripe 成功なのに DB 未記録」の逆方向（DB 先行）を担保する。
    const stripePayout = vi.fn(
      async (_params: {
        connectedAccountId: string;
        amount: number;
        currency: string;
        idempotencyKey: string;
        payoutId: string;
      }) => {
        // この時点で着金可能額は 0（既に paid 化済み）であるべき
        const balanceAtCall = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
        expect(balanceAtCall!.payableAmount).toBe(0);
        expect(balanceAtCall!.paidAmount).toBe(680);
        // pending の payout 行も既に存在する
        const payoutsAtCall = await getStaffPayouts(mock.repo, "auth-A");
        expect(payoutsAtCall!.items).toHaveLength(1);
        expect(payoutsAtCall!.items[0]!.status).toBe("pending");
        return { payoutId: "po_order_1" };
      },
    );

    const result = await createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-A");
    expect(result!.amount).toBe(680);
    expect(stripePayout).toHaveBeenCalledTimes(1);
  });

  it("createStaffPayout: Stripe 失敗時は payout=failed＋tip が payable へ戻る（revert）。例外は呼び出し元へ伝播", async () => {
    await setupVerifiedWithPayable();

    // Stripe payout が残高不足などで失敗するケース
    const failingStripePayout = vi.fn(async () => {
      throw new Error("insufficient_funds");
    });

    // 例外は呼び出し元へ伝播する（ユーザーにはエラー表示）
    await expect(
      createStaffPayout(mock.repo, failingStripePayout, makeGetConnectBalance(), "auth-A"),
    ).rejects.toThrow("insufficient_funds");

    // revert により着金可能額が復活する（tip が payable へ戻る・二重送金の不整合を防ぐ）
    const balance = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(balance!.payableAmount).toBe(680);
    expect(balance!.paidAmount).toBe(0);

    // payout 行は failed＋failure_reason 記録（履歴に残す）
    const payouts = await getStaffPayouts(mock.repo, "auth-A");
    expect(payouts!.items).toHaveLength(1);
    expect(payouts!.items[0]!.status).toBe("failed");
    expect(payouts!.items[0]!.failureReason).toBe("insufficient_funds");

    // revert 後は再度送金でき、正常に paid 化できる（残高が戻っているため）
    const retry = await createStaffPayout(mock.repo, makeStripePayout("po_retry_1"), makeGetConnectBalance(), "auth-A");
    expect(retry!.amount).toBe(680);
    const afterRetry = await getStaffBalance(mock.repo, makeGetConnectBalance(), "auth-A");
    expect(afterRetry!.payableAmount).toBe(0);
  });

  it("createStaffPayout: idempotency_key・metadata.payout_id に自前 payout 行の id を渡す（二重送金防止／Webhook 照合）", async () => {
    await setupVerifiedWithPayable();
    const stripePayout = makeStripePayout("po_idem_1");

    const result = await createStaffPayout(mock.repo, stripePayout, makeGetConnectBalance(), "auth-A");
    // idempotencyKey と metadata 用 payoutId はどちらも自前 payout 行の id（再試行で二重作成しない）
    const callArg = stripePayout.mock.calls[0]![0];
    expect(callArg.idempotencyKey).toBe(result!.id);
    expect(callArg.payoutId).toBe(result!.id);
  });

  it("applyPayoutWebhookUpdate: stripe_payout_id 未補完でも metadata.payout_id（自前 id）で確定できる（照合バックアップ）", async () => {
    await setupVerifiedWithPayable();

    // stripe_payout_id を補完しないケースを模す: createPendingPayoutAndMarkTipsPaid だけ行い、
    // attach をスキップ（= Stripe 成功直後に attach 前で落ちた状況）
    const ctx = await mock.repo.findPayoutContext("auth-A");
    const payable = await mock.repo.listPayableTipsByAuthUserId("auth-A");
    const amount = payable.reduce((s, t) => s + Math.floor(t.amount * 0.85), 0);
    const pending = await mock.repo.createPendingPayoutAndMarkTipsPaid({
      staffId: ctx!.staffId,
      amount,
      tipIds: payable.map((t) => t.tipId),
    });

    // Webhook が stripe_payout_id（主）では引けないが metadata.payout_id（= 自前 id・従）で確定できる
    const paid = await applyPayoutWebhookUpdate(mock.repo, {
      kind: "paid",
      stripePayoutId: "po_unknown_to_db",
      payoutId: pending.id,
      arrivedAt: new Date("2026-07-02T00:00:00Z"),
      failureReason: null,
    });
    expect(paid).toBe(true);
    const payouts = await getStaffPayouts(mock.repo, "auth-A");
    const target = payouts!.items.find((p) => p.id === pending.id);
    expect(target!.status).toBe("paid");
    expect(target!.arrivedAt).not.toBeNull();
  });
});
