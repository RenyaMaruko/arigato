import { describe, it, expect, beforeEach } from "vitest";
import {
  getInviteInfo,
  getStaffMe,
  createStaffProfile,
  updateStaffProfile,
  InviteNotUsableError,
  StaffAlreadyExistsError,
} from "./staff.service.js";
import { buildTipUrl } from "./staff.model.js";
import type {
  StaffRepository,
  InviteRow,
  StaffProfileRow,
} from "./staff.repository.js";

/**
 * staff Service のテスト。
 * 招待検証・招待による所属確定（store_id 確定）・本人スコープ・本人確認なし成立・
 * 多重作成防止・招待無効の各ユースケースをモック Repository で検証する。
 */

// テスト用のモック Repository（実 DB を使わず Service のロジックを検証する）
function createMockRepo() {
  const invites = new Map<string, InviteRow>();
  const staffByAuth = new Map<string, StaffProfileRow>();

  const repo: StaffRepository = {
    async findInviteByCode(code) {
      return invites.get(code) ?? null;
    },
    async findStaffByAuthUserId(authUserId) {
      return staffByAuth.get(authUserId) ?? null;
    },
    async createStaffWithInvite(code, params) {
      const invite = invites.get(code);
      if (!invite || invite.inviteStatus !== "pending") {
        throw new Error("invite_not_usable");
      }
      const row: StaffProfileRow = {
        id: `staff-${params.authUserId}`,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
        storeId: params.storeId,
        storeName: invite.storeName,
        // 本人確認なしで成立するため none のまま
        identityStatus: "none",
      };
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      staffByAuth.set(params.authUserId, row);
      return row;
    },
    async updateStaffProfile(authUserId, params) {
      const existing = staffByAuth.get(authUserId);
      if (!existing) return null;
      const updated = { ...existing, ...params };
      staffByAuth.set(authUserId, updated);
      return updated;
    },
  };

  return { repo, invites, staffByAuth };
}

// QR用URL の組み立て（ローカルのベース URL を使う）
const buildUrl = (staffId: string) => buildTipUrl("http://localhost:5173", staffId);

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
      storeStatus: "approved",
    });
    // 店が未承認の招待（使えないはず）
    mock.invites.set("INV-STORE-PENDING", {
      code: "INV-STORE-PENDING",
      storeId: "store-2",
      storeName: "未承認の店",
      inviteStatus: "pending",
      storeStatus: "pending",
    });
  });

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

  it("createStaffProfile: 招待コードで store_id が確定し、本人確認なし（identity_status=none）で成立する", async () => {
    const me = await createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      inviteCode: "INV-OK",
      displayName: "山田 さくら",
      headline: "カフェで働いています",
    });
    // 招待の店に所属が確定する
    expect(me.storeId).toBe("store-1");
    expect(me.storeName).toBe("カフェ Arigato");
    expect(me.displayName).toBe("山田 さくら");
    // 本人確認・口座登録なしで成立 → none のまま
    expect(me.identityStatus).toBe("none");
    // QR用URL が /tip/:staffId を指す
    expect(me.tipUrl).toBe(`http://localhost:5173/tip/${me.id}`);
    // 招待は消費される（accepted）
    expect(mock.invites.get("INV-OK")!.inviteStatus).toBe("accepted");
  });

  it("createStaffProfile: 店未承認の招待では作成できない（InviteNotUsableError）", async () => {
    await expect(
      createStaffProfile(mock.repo, buildUrl, "auth-user-2", {
        inviteCode: "INV-STORE-PENDING",
        displayName: "誰か",
      }),
    ).rejects.toBeInstanceOf(InviteNotUsableError);
  });

  it("createStaffProfile: 存在しない招待では作成できない", async () => {
    await expect(
      createStaffProfile(mock.repo, buildUrl, "auth-user-3", {
        inviteCode: "NOPE",
        displayName: "誰か",
      }),
    ).rejects.toBeInstanceOf(InviteNotUsableError);
  });

  it("createStaffProfile: 既にプロフィールがあると多重作成できない（StaffAlreadyExistsError）", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      inviteCode: "INV-OK",
      displayName: "山田 さくら",
    });
    // 同じ auth ユーザーが再度作成しようとすると弾かれる
    mock.invites.set("INV-OK-2", {
      code: "INV-OK-2",
      storeId: "store-1",
      storeName: "カフェ Arigato",
      inviteStatus: "pending",
      storeStatus: "approved",
    });
    await expect(
      createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
        inviteCode: "INV-OK-2",
        displayName: "別名",
      }),
    ).rejects.toBeInstanceOf(StaffAlreadyExistsError);
  });

  it("getStaffMe: 本人スコープ — 自分の行のみ返り、他人の authUserId では取得できない", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      inviteCode: "INV-OK",
      displayName: "山田 さくら",
    });
    // 本人なら取得できる
    const me = await getStaffMe(mock.repo, buildUrl, "auth-user-1");
    expect(me).not.toBeNull();
    expect(me!.displayName).toBe("山田 さくら");
    // 他人の authUserId では何も返らない（自分のスコープのみ）
    const other = await getStaffMe(mock.repo, buildUrl, "auth-user-OTHER");
    expect(other).toBeNull();
  });

  it("updateStaffProfile: 本人の display_name / headline を更新でき、所属は変わらない", async () => {
    await createStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      inviteCode: "INV-OK",
      displayName: "山田 さくら",
      headline: "古い一言",
    });
    const updated = await updateStaffProfile(mock.repo, buildUrl, "auth-user-1", {
      displayName: "山田 さくら",
      headline: "新しい一言☕",
    });
    expect(updated!.headline).toBe("新しい一言☕");
    // 所属店は招待で確定した値のまま
    expect(updated!.storeId).toBe("store-1");
  });

  it("updateStaffProfile: プロフィール未作成なら null", async () => {
    const res = await updateStaffProfile(mock.repo, buildUrl, "no-staff", {
      displayName: "x",
    });
    expect(res).toBeNull();
  });
});
