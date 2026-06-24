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
  InviteNotUsableError,
  StaffAlreadyExistsError,
  StaffNotFoundError,
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

// テスト用のモック Repository（実 DB を使わず Service のロジックを検証する・多対多）
function createMockRepo() {
  const invites = new Map<string, InviteRow>();
  const staffByAuth = new Map<string, StaffProfileRow>();
  // authUserId → 所属（membership）一覧
  const membershipsByAuth = new Map<string, StaffMembershipRow[]>();
  // authUserId → 受取履歴（本人スコープを検証するため auth ごとに分けて保持）
  const tipsByAuth = new Map<string, StaffTipRow[]>();
  // authUserId → Connected Account ID
  const accountByAuth = new Map<string, string | null>();
  // membership ID の採番カウンタ
  let membershipSeq = 0;

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
  };

  return { repo, invites, staffByAuth, membershipsByAuth, tipsByAuth, accountByAuth };
}

// QR用URL の組み立て（ローカルのベース URL を使う・membership 単位）
const buildUrl = (membershipId: string) => buildTipUrl("http://localhost:5173", membershipId);

// プロフィール作成＋参加までを一気に行うヘルパ（新規ユーザーの典型フロー）
async function setupAndJoin(
  mock: ReturnType<typeof createMockRepo>,
  authUserId: string,
  displayName: string,
  code: string,
) {
  await createStaffProfile(mock.repo, buildUrl, authUserId, { displayName });
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
    const me = await createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
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

  it("createStaffProfile: 既にプロフィールがあると多重作成できない（StaffAlreadyExistsError）", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", { displayName: "山田 さくら" });
    // 同じ auth ユーザーが再度作成しようとすると弾かれる
    await expect(
      createStaffProfile(mock.repo, buildUrl, "auth-user-1", { displayName: "別名" }),
    ).rejects.toBeInstanceOf(StaffAlreadyExistsError);
  });

  // --- 参加（join）: 新規 / 同店重複 / 招待無効 / プロフィール未作成 ---

  it("joinStore: 招待コードで所属（membership）を1件作り joined を返す。QR用URLは /tip/:membershipId", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", { displayName: "山田 さくら" });
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
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", { displayName: "誰か" });
    await expect(
      joinStore(mock.repo, buildUrl, "auth-user-1", "INV-STORE-PENDING"),
    ).rejects.toBeInstanceOf(InviteNotUsableError);
  });

  it("joinStore: 存在しない招待では参加できない（InviteNotUsableError）", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", { displayName: "誰か" });
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
    expect(tips!.totalAmount).toBe(800);
    // 金額・メッセージ・受取日時・店ラベルを含む
    expect(tips!.items[0]!.amount).toBe(300);
    expect(tips!.items[0]!.message).toBe("ありがとう");
    expect(tips!.items[0]!.receivedAt).toBe("2025-05-15T10:32:00Z");
    expect(tips!.items[0]!.storeName).toBe("カフェ Arigato");
  });

  it("getStaffTips: 本人スコープ — 他人の履歴・金額は混ざらない", async () => {
    await seedTwoStaffWithTips();
    const a = await getStaffTips(mock.repo, "auth-A");
    const b = await getStaffTips(mock.repo, "auth-B");
    // A は自分の2件・合計800のみ。B の100は混ざらない
    expect(a!.totalAmount).toBe(800);
    expect(a!.items.map((i) => i.id)).not.toContain("33333333-3333-3333-3333-333333333333");
    // B は自分の1件・合計100のみ
    expect(b!.totalAmount).toBe(100);
    expect(b!.items).toHaveLength(1);
  });

  it("getStaffTips: プロフィール未作成なら null（金額を漏らさない）", async () => {
    expect(await getStaffTips(mock.repo, "no-staff")).toBeNull();
  });

  it("getStaffBalance: held 合計（保留残高）と着金可能額を本人に返す（人ごと集約）", async () => {
    await seedTwoStaffWithTips();
    const balance = await getStaffBalance(mock.repo, "auth-A");
    expect(balance).not.toBeNull();
    // 本人確認前のため held=800 / payable=0、canPayout=false
    expect(balance!.heldAmount).toBe(800);
    expect(balance!.payableAmount).toBe(0);
    expect(balance!.canPayout).toBe(false);
    expect(balance!.identityStatus).toBe("none");
  });

  it("getStaffBalance: 本人スコープ — 他人の残高は見えない", async () => {
    await seedTwoStaffWithTips();
    const b = await getStaffBalance(mock.repo, "auth-B");
    // B の保留残高は自分の100のみ（A の800は混ざらない）
    expect(b!.heldAmount).toBe(100);
  });

  it("getStaffTaxReport: 受取日 / 金額 / 店名 を含む CSV を返す", async () => {
    await seedTwoStaffWithTips();
    const csv = await getStaffTaxReport(mock.repo, "auth-A", 2025);
    expect(csv).not.toBeNull();
    expect(csv!).toContain("受取日,金額,店名");
    expect(csv!).toContain("2025-05-15,300,カフェ Arigato");
  });

  // --- Connect オンボーディング ---

  it("startConnectOnboarding: リンクを発行し、新規 Connected Account を本人に保存する", async () => {
    await setupAndJoin(mock, "auth-A", "Aさん", "INV-OK");
    // Connected Account を新規作成してリンクを返す infrastructure をモック
    const createLink = vi.fn(async () => ({
      onboardingUrl: "https://connect.stripe.com/setup/acct_new",
      connectedAccountId: "acct_new",
    }));
    const buildUrls = () => ({
      returnUrl: "http://localhost:5173/staff/identity/complete",
      refreshUrl: "http://localhost:5173/staff/balance",
    });

    const result = await startConnectOnboarding(mock.repo, createLink, buildUrls, "auth-A");
    expect(result).not.toBeNull();
    expect(result!.onboardingUrl).toBe("https://connect.stripe.com/setup/acct_new");
    // 未連携だったので新規作成され、保存される
    expect(createLink).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountId: null, staffDisplayName: "Aさん" }),
    );
    const connect = await mock.repo.findStaffConnect("auth-A");
    expect(connect!.stripeAccountId).toBe("acct_new");
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
    // A の Connected Account をオンボーディング開始で紐づける
    await startConnectOnboarding(
      mock.repo,
      async () => ({
        onboardingUrl: "https://connect.stripe.com/x",
        connectedAccountId: "acct_A",
      }),
      () => ({ returnUrl: "r", refreshUrl: "f" }),
      "auth-A",
    );

    const result = await applyConnectAccountUpdate(mock.repo, "acct_A", true);
    expect(result.found).toBe(true);
    expect(result.verified).toBe(true);
    // A の held 2件が payable へ昇格する
    expect(result.promotedTips).toBe(2);

    // 残高は held=0 / payable=800、本人確認は verified になる
    const balance = await getStaffBalance(mock.repo, "auth-A");
    expect(balance!.heldAmount).toBe(0);
    expect(balance!.payableAmount).toBe(800);
    expect(balance!.canPayout).toBe(true);
    expect(balance!.identityStatus).toBe("verified");
  });

  it("applyConnectAccountUpdate: 冪等 — 2回目は二重遷移しない（promotedTips=0）", async () => {
    await seedTwoStaffWithTips();
    await startConnectOnboarding(
      mock.repo,
      async () => ({
        onboardingUrl: "https://connect.stripe.com/x",
        connectedAccountId: "acct_A",
      }),
      () => ({ returnUrl: "r", refreshUrl: "f" }),
      "auth-A",
    );

    const first = await applyConnectAccountUpdate(mock.repo, "acct_A", true);
    const second = await applyConnectAccountUpdate(mock.repo, "acct_A", true);
    expect(first.promotedTips).toBe(2);
    // 既に verified のため二重遷移しない
    expect(second.verified).toBe(true);
    expect(second.promotedTips).toBe(0);
    // payable は800のまま（二重加算されない）
    const balance = await getStaffBalance(mock.repo, "auth-A");
    expect(balance!.payableAmount).toBe(800);
  });

  it("applyConnectAccountUpdate: 該当口座が無ければ found=false", async () => {
    const res = await applyConnectAccountUpdate(mock.repo, "acct_unknown", true);
    expect(res.found).toBe(false);
    expect(res.promotedTips).toBe(0);
  });
});
