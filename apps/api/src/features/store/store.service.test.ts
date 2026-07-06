import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getMyStore,
  listMyManagedStores,
  createStore,
  getStore,
  updateStore,
  createStoreInvite,
  listStoreInvites,
  revokeStoreInvite,
  listStoreStaff,
  getStoreStaffDetail,
  removeStoreStaff,
  getStoreGratitude,
  uploadStoreLogo,
  closeStore,
  transferStoreOwner,
  handleOwnerDeparture,
  createStoreAdminInvite,
  listStoreAdmins,
  removeStoreAdmin,
  leaveStoreAsOwner,
  StoreForbiddenError,
  StoreNotFoundError,
  StoreInviteNotFoundError,
  StoreStaffNotFoundError,
  StoreAdminNotFoundError,
  InvalidImageError,
} from "./store.service.js";
import { buildInviteUrl } from "./store.model.js";
import type { StoreRole } from "./store.model.js";
import type {
  StoreRepository,
  StoreRow,
  StoreInviteRow,
  StoreStaffRow,
  StoreAdminRow,
  GratitudeVoiceRow,
  GratitudeTimeRow,
  GratitudePerStaffRow,
} from "./store.repository.js";

/**
 * store Service のテスト。
 * 承認・招待発行/一覧・スタッフ一覧・感謝集計の各ユースケースをモック Repository で検証する。
 *
 * 特に重要な検証:
 *  - 店スコープ: 自店のみ操作でき、他店（別 owner / owner 未紐付け）は 404 相当のエラーになる。
 *  - 金額非表示: 感謝の可視化の応答に amount / customer_total / platform_fee / 残高が一切含まれない。
 */

const buildUrl = (code: string) => buildInviteUrl("http://localhost:5173", code);

// QR が指す固定 URL（/tip/:membershipId）を組み立てるテスト用ヘルパ（app.ts の buildStaffTipUrl 相当）
const buildTip = (membershipId: string) => `http://localhost:5173/tip/${membershipId}`;

// 受取日時が期間（from 含む・to 排他）に入るか判定するテスト用ヘルパ（実 DB の SQL と同じ規則）
function inPeriod(receivedAt: string, period?: { from?: string; to?: string }): boolean {
  if (!period) return true;
  const t = new Date(receivedAt).getTime();
  if (period.from && t < new Date(period.from).getTime()) return false;
  if (period.to && t >= new Date(period.to).getTime()) return false;
  return true;
}

// テスト用のモック Repository（実 DB を使わず Service のロジックを検証する）
function createMockRepo() {
  const stores = new Map<string, StoreRow>();
  const invitesByStore = new Map<string, StoreInviteRow[]>();
  // スタッフ行に authUserId / membershipId（いずれも任意）を持たせ、店員でもある管理者のロール解決や
  // 所属（membership）由来の QR 用 URL（tipUrl）の組み立てを検証できるようにする
  const staffByStore = new Map<
    string,
    (StoreStaffRow & { authUserId?: string; membershipId?: string })[]
  >();
  // 店の管理者（store_admin 相当）。store_id ごとに保持。leftAt は論理削除（null＝active）
  const adminsByStore = new Map<
    string,
    { authUserId: string; role: StoreRole; createdAt: string; leftAt: number | null }[]
  >();
  // 在籍解除（論理削除）済みの (storeId, staffId) 集合（left_at 相当）。在籍中＝この集合に無い
  const removedStaff = new Set<string>();
  const removedKey = (storeId: string, staffId: string) => `${storeId}::${staffId}`;
  // 声に staffId を持たせて、staffId 絞りの検証ができるようにする（実 DB の t.staff_id = ... と同じ振る舞い）
  const voicesByStore = new Map<string, (GratitudeVoiceRow & { staffId?: string })[]>();
  const timesByStore = new Map<string, GratitudeTimeRow[]>();
  const perStaffByStore = new Map<string, GratitudePerStaffRow[]>();
  // スタッフ別の受取日時明細（期間でスタッフ別件数を数え直す検証に使う）
  const perStaffTimesByStore = new Map<
    string,
    { staffId: string; staffName: string; times: string[] }[]
  >();

  const repo: StoreRepository = {
    async findStoreById(storeId) {
      return stores.get(storeId) ?? null;
    },
    async findStoreForAdmin(authUserId) {
      // owner 優先→古参順で、閉店していない店のうち自分が active 管理者の店を返す
      let best: { store: StoreRow; isOwner: boolean; createdAt: string } | null = null;
      for (const [storeId, admins] of adminsByStore) {
        const store = stores.get(storeId);
        if (!store || store.closedAt !== null) continue;
        const mine = admins.find((a) => a.authUserId === authUserId && a.leftAt === null);
        if (!mine) continue;
        const isOwner = mine.role === "owner";
        if (
          !best ||
          (isOwner && !best.isOwner) ||
          (isOwner === best.isOwner && mine.createdAt < best.createdAt)
        ) {
          best = { store, isOwner, createdAt: mine.createdAt };
        }
      }
      return best?.store ?? null;
    },
    // 自分が active な管理者（owner/admin）である営業中の店を全件返す（owner 先頭→古参順・閉店除外）
    async listManagedStores(authUserId) {
      const rows: { id: string; name: string; logoUrl: string | null; role: StoreRole; createdAt: string }[] = [];
      for (const [storeId, admins] of adminsByStore) {
        const store = stores.get(storeId);
        if (!store || store.closedAt !== null) continue;
        const mine = admins.find((a) => a.authUserId === authUserId && a.leftAt === null);
        if (!mine) continue;
        rows.push({ id: store.id, name: store.name, logoUrl: store.logoUrl, role: mine.role, createdAt: mine.createdAt });
      }
      rows.sort((x, y) => {
        if ((x.role === "owner") !== (y.role === "owner")) return x.role === "owner" ? -1 : 1;
        if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? -1 : 1;
        return x.id < y.id ? -1 : 1;
      });
      return rows.map(({ id, name, logoUrl, role }) => ({ id, name, logoUrl, role }));
    },
    async createStoreWithOwner(params) {
      const id = `store-${stores.size + 1}`;
      const created: StoreRow = {
        id,
        name: params.name,
        description: params.description,
        industry: params.industry,
        logoUrl: params.logoUrl,
        adoptionAgreedAt: "2026-06-23T00:00:00Z",
        closedAt: null,
      };
      stores.set(id, created);
      adminsByStore.set(id, [
        { authUserId: params.creatorAuthUserId, role: "owner", createdAt: "2026-06-23T00:00:00Z", leftAt: null },
      ]);
      return created;
    },
    async findActiveAdminRole(storeId, authUserId) {
      const a = (adminsByStore.get(storeId) ?? []).find(
        (x) => x.authUserId === authUserId && x.leftAt === null,
      );
      return a?.role ?? null;
    },
    async listActiveAdmins(storeId) {
      return (adminsByStore.get(storeId) ?? [])
        .filter((a) => a.leftAt === null)
        .sort((x, y) =>
          x.createdAt < y.createdAt
            ? -1
            : x.createdAt > y.createdAt
              ? 1
              : x.authUserId < y.authUserId
                ? -1
                : 1,
        )
        .map<StoreAdminRow>((a) => ({ authUserId: a.authUserId, role: a.role, createdAt: a.createdAt }));
    },
    async leaveAdmin(storeId, authUserId) {
      const a = (adminsByStore.get(storeId) ?? []).find(
        (x) => x.authUserId === authUserId && x.leftAt === null,
      );
      if (!a) return 0;
      a.leftAt = Date.now();
      return 1;
    },
    async promoteAdminToOwner(storeId, authUserId) {
      const a = (adminsByStore.get(storeId) ?? []).find(
        (x) => x.authUserId === authUserId && x.role === "admin" && x.leftAt === null,
      );
      if (!a) return 0;
      a.role = "owner";
      return 1;
    },
    async transferOwner(storeId, fromAuthUserId, toAuthUserId) {
      const admins = adminsByStore.get(storeId) ?? [];
      const from = admins.find(
        (x) => x.authUserId === fromAuthUserId && x.role === "owner" && x.leftAt === null,
      );
      if (!from) throw new Error("transfer_owner_from_not_owner");
      const to = admins.find(
        (x) => x.authUserId === toAuthUserId && x.role === "admin" && x.leftAt === null,
      );
      if (!to) throw new Error("transfer_owner_to_not_admin");
      from.role = "admin";
      to.role = "owner";
    },
    async closeStore(storeId) {
      const store = stores.get(storeId);
      if (!store || store.closedAt !== null) return null;
      const closed: StoreRow = { ...store, closedAt: "2026-06-23T09:00:00Z" };
      stores.set(storeId, closed);
      // 在籍中の所属（QR）を無効化する（在籍解除集合に入れる）
      for (const s of staffByStore.get(storeId) ?? []) {
        removedStaff.add(removedKey(storeId, s.id));
      }
      // active な管理者を外す
      for (const a of adminsByStore.get(storeId) ?? []) {
        if (a.leftAt === null) a.leftAt = Date.now();
      }
      return closed;
    },
    async updateStore(storeId, params) {
      const s = stores.get(storeId);
      if (!s) return null;
      const updated: StoreRow = { ...s, ...params };
      stores.set(storeId, updated);
      return updated;
    },
    async setLogoUrl(storeId, logoUrl) {
      const s = stores.get(storeId);
      if (!s) return;
      stores.set(storeId, { ...s, logoUrl });
    },
    async createInvite(storeId, code, label) {
      const invite: StoreInviteRow = {
        code,
        status: "pending",
        type: "staff",
        createdAt: "2026-06-23T00:00:00Z",
        acceptedStaffName: null,
        acceptedAt: null,
        label: label ?? null,
      };
      const list = invitesByStore.get(storeId) ?? [];
      list.unshift(invite);
      invitesByStore.set(storeId, list);
      return invite;
    },
    async listInvites(storeId) {
      // 実装と同じく招待中（pending）だけを返す（スタッフ招待＋管理者招待の両方）
      return (invitesByStore.get(storeId) ?? []).filter((i) => i.status === "pending");
    },
    async findInviteByCode(storeId, code) {
      const list = invitesByStore.get(storeId) ?? [];
      return list.find((i) => i.code === code && i.status === "pending") ?? null;
    },
    async revokeInvite(storeId, code) {
      const list = invitesByStore.get(storeId) ?? [];
      const target = list.find((i) => i.code === code && i.status === "pending");
      if (!target) return 0;
      target.status = "revoked";
      return 1;
    },
    async listStaff(storeId) {
      // 在籍中（在籍解除集合に無い）のみ返す
      return (staffByStore.get(storeId) ?? []).filter(
        (s) => !removedStaff.has(removedKey(storeId, s.id)),
      );
    },
    // 在籍中スタッフ1人の詳細（参加日付き・金額なし）。脱退済み・他店・存在しないは null。
    // その人の authUserId（無ければ id で代用）から active な管理者ロールを引いて role を埋める（詳細のロール出し分け検証用）。
    // membershipId（所属＝staff_store の ID 相当）は指定が無ければ id から導出する（tipUrl 組み立ての検証用）。
    async findStaffDetail(storeId, staffId) {
      const s = (staffByStore.get(storeId) ?? []).find((x) => x.id === staffId);
      if (!s || removedStaff.has(removedKey(storeId, staffId))) return null;
      const authUserId = s.authUserId ?? s.id;
      const admin = (adminsByStore.get(storeId) ?? []).find(
        (a) => a.authUserId === authUserId && a.leftAt === null,
      );
      return {
        id: s.id,
        displayName: s.displayName,
        headline: s.headline,
        avatarUrl: s.avatarUrl,
        joinedAt: "2026-06-23T00:00:00Z",
        membershipId: s.membershipId ?? `membership-${s.id}`,
        authUserId,
        role: admin?.role ?? null,
      };
    },
    // 自店のスタッフを在籍解除する（論理削除）。在籍中のみ対象。解除できた件数を返す
    async removeStaff(storeId, staffId) {
      const s = (staffByStore.get(storeId) ?? []).find((x) => x.id === staffId);
      if (!s || removedStaff.has(removedKey(storeId, staffId))) return 0;
      removedStaff.add(removedKey(storeId, staffId));
      return 1;
    },
    async listGratitudeVoices(storeId, limit, period, staffId) {
      // 期間（from 含む・to 排他）が来たら受取日時で絞る。実 DB の SQL と同じ振る舞いをモックでも再現する
      const all = voicesByStore.get(storeId) ?? [];
      const filtered = all.filter((v) => {
        if (!inPeriod(v.receivedAt, period)) return false;
        // staffId 指定時はそのスタッフ宛の声だけに絞る（実 DB の AND t.staff_id = ... と同じ）
        if (staffId && v.staffId !== staffId) return false;
        return true;
      });
      // staffId などを応答に漏らさないよう、契約どおりの GratitudeVoiceRow に整形して返す
      return filtered
        .slice(0, limit)
        .map(({ id, message, receivedAt, staffName }) => ({ id, message, receivedAt, staffName }));
    },
    async listGratitudeTimes(storeId) {
      // 件数集計用は全期間を返す（期間絞りと今週判定は Model 側で行う）
      return [...(timesByStore.get(storeId) ?? [])];
    },
    async listGratitudePerStaff(storeId, period) {
      // 期間が来たら、件数を期間で数え直す（perStaffTimesByStore に明細があればそれを使う）
      const detail = perStaffTimesByStore.get(storeId);
      if (detail && period && (period.from || period.to)) {
        return detail.map((d) => ({
          staffId: d.staffId,
          staffName: d.staffName,
          avatarUrl: null,
          count: d.times.filter((tm) => inPeriod(tm, period)).length,
        }));
      }
      return [...(perStaffByStore.get(storeId) ?? [])];
    },
    // 管理者一覧（表示用）。owner 先頭・古参順。インメモリは staff プロフィールを持たないため表示名は null
    async listAdminsForDisplay(storeId) {
      return (adminsByStore.get(storeId) ?? [])
        .filter((a) => a.leftAt === null)
        .sort((x, y) => {
          if ((x.role === "owner") !== (y.role === "owner")) return x.role === "owner" ? -1 : 1;
          if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? -1 : 1;
          return x.authUserId < y.authUserId ? -1 : 1;
        })
        .map((a) => ({
          authUserId: a.authUserId,
          role: a.role,
          displayName: null,
          avatarUrl: null,
          createdAt: a.createdAt,
        }));
    },
    // active な管理者(admin)1人を外す（owner は対象外）。外せた件数を返す
    async removeAdmin(storeId, authUserId) {
      const a = (adminsByStore.get(storeId) ?? []).find(
        (x) => x.authUserId === authUserId && x.role === "admin" && x.leftAt === null,
      );
      if (!a) return 0;
      a.leftAt = Date.now();
      return 1;
    },
    // 自分が active な管理者である営業中の店が1つ以上あるか（モード切替の判定）
    async hasManagedStore(authUserId) {
      for (const [storeId, admins] of adminsByStore) {
        const store = stores.get(storeId);
        if (!store || store.closedAt !== null) continue;
        if (admins.some((a) => a.authUserId === authUserId && a.leftAt === null)) return true;
      }
      return false;
    },
    // 管理者招待（type='admin'）を発行する（pending）。テストでは type を追跡しないが契約を満たす
    async createAdminInvite(storeId, code, label) {
      const invite: StoreInviteRow = {
        code,
        status: "pending",
        type: "admin",
        createdAt: "2026-06-23T00:00:00Z",
        acceptedStaffName: null,
        acceptedAt: null,
        label: label ?? null,
      };
      const list = invitesByStore.get(storeId) ?? [];
      list.unshift(invite);
      invitesByStore.set(storeId, list);
      return invite;
    },
  };

  return {
    repo,
    stores,
    invitesByStore,
    staffByStore,
    adminsByStore,
    voicesByStore,
    timesByStore,
    perStaffByStore,
    perStaffTimesByStore,
  };
}

// owner 付きの店を1件用意するヘルパ（既に作成済みの店＋owner の store_admin をシードする）。
// ownerAuthUserId が null のときは「管理者が誰もいない店」（移行相当）をシードする。
function seedOwnedStore(
  m: ReturnType<typeof createMockRepo>,
  storeId: string,
  ownerAuthUserId: string | null,
) {
  m.stores.set(storeId, {
    id: storeId,
    name: "カフェ Arigato",
    description: null,
    industry: null,
    logoUrl: null,
    adoptionAgreedAt: "2026-06-23T00:00:00Z",
    closedAt: null,
  });
  m.adminsByStore.set(
    storeId,
    ownerAuthUserId
      ? [{ authUserId: ownerAuthUserId, role: "owner", createdAt: "2026-06-23T00:00:00Z", leftAt: null }]
      : [],
  );
}

// 追加の管理者（admin）を店に足すヘルパ（owner 譲渡・自動継承のテスト用）。
function seedAdmin(
  m: ReturnType<typeof createMockRepo>,
  storeId: string,
  authUserId: string,
  createdAt: string,
  role: StoreRole = "admin",
) {
  const list = m.adminsByStore.get(storeId) ?? [];
  list.push({ authUserId, role, createdAt, leftAt: null });
  m.adminsByStore.set(storeId, list);
}

describe("store.service", () => {
  let m: ReturnType<typeof createMockRepo>;
  beforeEach(() => {
    m = createMockRepo();
  });

  it("getMyStore: 所有する店を返す。未所有なら null", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    expect((await getMyStore(m.repo, "owner-1"))?.id).toBe("store-1");
    expect(await getMyStore(m.repo, "stranger")).toBeNull();
  });

  it("createStore: セルフサーブで店舗を作成し、作成者を所有者・導入承認に同意済みにする", async () => {
    const created = await createStore(m.repo, "owner-1", {
      name: "  カフェ Arigato ",
      adoptionAgreed: true,
      description: "  ", // 空白は null に正規化
      industry: "カフェ・喫茶",
    });
    // 作成者が所有者になり、自分の店として取得できる
    expect(created.name).toBe("カフェ Arigato");
    expect(created.description).toBeNull();
    expect(created.industry).toBe("カフェ・喫茶");
    // 導入承認の同意日時が記録される
    expect(created.adoptionAgreedAt).not.toBeNull();
    // GET /store/me で自分の店として引ける
    expect((await getMyStore(m.repo, "owner-1"))?.id).toBe(created.id);
  });

  it("createStore: 複数店舗を作成できる（§11.4・1アカウントで何店でも）", async () => {
    const a = await createStore(m.repo, "owner-1", { name: "1号店", adoptionAgreed: true });
    // 同じアカウントの2回目も作成できる（1アカウント1店舗の制限は撤廃）
    const b = await createStore(m.repo, "owner-1", { name: "2号店", adoptionAgreed: true });
    expect(a.id).not.toBe(b.id);
    // 両方とも自分が管理する店として引ける（GET /store/mine）
    const mine = await listMyManagedStores(m.repo, "owner-1");
    expect(mine.items.map((i) => i.name).sort()).toEqual(["1号店", "2号店"]);
    // 作成した2店ともロールは owner
    expect(mine.items.every((i) => i.role === "owner")).toBe(true);
  });

  it("listMyManagedStores: owner/admin として管理する店を owner 先頭・古参順で返す（金額なし）", async () => {
    // owner の店・admin の店・他人だけの店・閉店した自分の店 を用意する
    seedOwnedStore(m, "store-owner", "me");
    seedOwnedStore(m, "store-admin", "someone");
    seedAdmin(m, "store-admin", "me", "2026-06-24T00:00:00Z", "admin");
    seedOwnedStore(m, "store-other", "stranger");
    seedOwnedStore(m, "store-closed", "me");
    m.stores.set("store-closed", { ...m.stores.get("store-closed")!, closedAt: "2026-06-25T00:00:00Z" });

    const mine = await listMyManagedStores(m.repo, "me");
    // 自分が active 管理者の営業中の店だけ（他人だけの店・閉店店は出ない）
    expect(mine.items.map((i) => i.id)).toEqual(["store-owner", "store-admin"]);
    // owner を先頭に並ぶ
    expect(mine.items[0]!.role).toBe("owner");
    expect(mine.items[1]!.role).toBe("admin");
    // 金額・件数・残高は含めない（id/name/logoUrl/role のみ）
    expect(Object.keys(mine.items[0]!).sort()).toEqual(["id", "logoUrl", "name", "role"]);
  });

  it("listMyManagedStores: 純店員（管理する店なし）は空配列", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const mine = await listMyManagedStores(m.repo, "pure-staff");
    expect(mine.items).toEqual([]);
  });

  it("店スコープ: 他店（別 owner）には触れない（404 相当）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await expect(getStore(m.repo, "intruder", "store-1")).rejects.toBeInstanceOf(
      StoreForbiddenError,
    );
  });

  it("店スコープ: owner 未紐付け（移行用の既存行）も他人は触れない", async () => {
    seedOwnedStore(m, "store-1", null);
    await expect(getStore(m.repo, "anyone", "store-1")).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  it("createStoreInvite: 一意コードと招待リンクを発行する（方式A）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const a = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    const b = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    expect(a.status).toBe("pending");
    expect(a.inviteUrl).toBe(`http://localhost:5173/invite/${a.code}`);
    expect(a.code).not.toBe(b.code);
  });

  it("createStoreInvite: label（誰宛かのメモ）を受けて保存し、応答に返す", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const withLabel = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", {
      label: "  佐藤さん ",
    });
    // 前後の空白は除いて保存・返却する
    expect(withLabel.label).toBe("佐藤さん");
    // 空白のみ・未入力は無記名（null）に正規化する
    const blank = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", { label: "   " });
    expect(blank.label).toBeNull();
    const omitted = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    expect(omitted.label).toBeNull();
  });

  it("listStoreInvites: 各 item に label を含めて返す", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", { label: "ホール担当" });
    const list = await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1");
    expect(list.items[0]!.label).toBe("ホール担当");
  });

  it("listStoreInvites: 発行済み招待を新しい順・pending件数つきで返す", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    const list = await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1");
    expect(list.items.length).toBe(2);
    expect(list.pendingCount).toBe(2);
    // 各 item に招待リンクが付く
    expect(list.items[0]!.inviteUrl).toContain("/invite/");
  });

  it("listStoreInvites: 招待中（pending）だけを返す（accepted/revoked は出さない）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // pending・accepted・revoked を 1 件ずつ用意する
    m.invitesByStore.set("store-1", [
      {
        code: "pending-1",
        status: "pending",
        type: "staff",
        createdAt: "2026-06-23T00:00:00Z",
        acceptedStaffName: null,
        acceptedAt: null,
        label: "佐藤さん",
      },
      {
        code: "accepted-1",
        status: "accepted",
        type: "staff",
        createdAt: "2026-06-22T00:00:00Z",
        acceptedStaffName: "山田 さくら",
        acceptedAt: "2026-06-22T01:00:00Z",
        label: null,
      },
      {
        code: "revoked-1",
        status: "revoked",
        type: "staff",
        createdAt: "2026-06-21T00:00:00Z",
        acceptedStaffName: null,
        acceptedAt: null,
        label: null,
      },
    ]);
    const list = await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1");
    // pending の 1 件だけが返る（在籍中タブに出る accepted、履歴管理しない revoked は除外）
    expect(list.items.length).toBe(1);
    expect(list.items[0]!.code).toBe("pending-1");
    expect(list.items[0]!.status).toBe("pending");
    expect(list.pendingCount).toBe(1);
  });

  it("listStoreInvites: スタッフ招待と管理者招待の両方を種類つきで返す（§11.2 統合タブ）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // スタッフ招待・管理者招待をそれぞれ発行する（owner は両方発行できる）
    await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", { label: "ホール担当" });
    await createStoreAdminInvite(m.repo, buildUrl, "owner-1", "store-1", { label: "副店長" });
    const list = await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1");
    // 両方の招待中が返り、種類（staff/admin）が付く
    expect(list.items.length).toBe(2);
    const types = list.items.map((i) => i.type).sort();
    expect(types).toEqual(["admin", "staff"]);
    expect(list.pendingCount).toBe(2);
  });

  it("revokeStoreInvite: 招待中（pending）を取り消すと一覧から消える", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const invite = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", {
      label: "佐藤さん",
    });
    // 取り消し前は招待中に存在する
    expect((await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1")).items.length).toBe(1);
    await revokeStoreInvite(m.repo, "owner-1", "store-1", invite.code);
    // 取り消し後は pending 一覧から消える
    const after = await listStoreInvites(m.repo, buildUrl, "owner-1", "store-1");
    expect(after.items.length).toBe(0);
    expect(after.pendingCount).toBe(0);
  });

  it("revokeStoreInvite: 対象が無い（未発行コード）は StoreInviteNotFoundError", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await expect(
      revokeStoreInvite(m.repo, "owner-1", "store-1", "no-such-code"),
    ).rejects.toBeInstanceOf(StoreInviteNotFoundError);
  });

  it("revokeStoreInvite: 既に取り消し済み（pending でない）は再取り消しできない", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const invite = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    await revokeStoreInvite(m.repo, "owner-1", "store-1", invite.code);
    // 2 回目は対象が無い扱い
    await expect(
      revokeStoreInvite(m.repo, "owner-1", "store-1", invite.code),
    ).rejects.toBeInstanceOf(StoreInviteNotFoundError);
  });

  it("revokeStoreInvite: 他店（別 owner）の招待は取り消せない（404 相当）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const invite = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1");
    // 別アカウントが同じ店に対して取り消そうとすると店スコープで弾かれる
    await expect(
      revokeStoreInvite(m.repo, "intruder", "store-1", invite.code),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  it("listStoreStaff: 自店の所属スタッフを名簿順で返す（金額・件数なし）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      // owner 自身も店員を兼ねる（authUserId が閲覧者と一致 → isSelf=true で「（自分）」表示）
      { id: "s1", displayName: "山田 さくら", headline: "ホール", avatarUrl: null, authUserId: "owner-1" },
      { id: "s2", displayName: "田中 健一", headline: "バリスタ", avatarUrl: null, authUserId: "u-s2" },
    ]);
    const res = await listStoreStaff(m.repo, "owner-1", "store-1");
    expect(res.count).toBe(2);
    expect(res.items[0]!.displayName).toBe("山田 さくら");
    // 閲覧者自身の行だけ isSelf=true（「（自分）」表示の判定）
    expect(res.items[0]!.isSelf).toBe(true);
    expect(res.items[1]!.isSelf).toBe(false);
    // 金額や件数のキーが含まれない
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/amount|customer_total|platform_fee|balance|payout/i);
  });

  it("getStoreStaffDetail: 在籍中スタッフの基本情報（参加日付き・金額なし）を返す", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: "ホール", avatarUrl: null },
    ]);
    const detail = await getStoreStaffDetail(m.repo, buildTip, "owner-1", "store-1", "s1");
    expect(detail.id).toBe("s1");
    expect(detail.displayName).toBe("山田 さくら");
    expect(detail.joinedAt).toBeTruthy();
    // 金額に関わるキーが含まれない（店はお金に触れない）
    expect(JSON.stringify(detail)).not.toMatch(/amount|customer_total|platform_fee|balance|payout/i);
  });

  it("getStoreStaffDetail: membershipId と QR が指す固定 URL（tipUrl）を返す（店側のQR表示・印刷用。金額なし）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      {
        id: "s1",
        displayName: "山田 さくら",
        headline: null,
        avatarUrl: null,
        membershipId: "mem-1",
      },
    ]);
    const detail = await getStoreStaffDetail(m.repo, buildTip, "owner-1", "store-1", "s1");
    // 所属（membership）と、店員本人のQRと同じ /tip/:membershipId を指す URL を返す
    expect(detail.membershipId).toBe("mem-1");
    expect(detail.tipUrl).toBe("http://localhost:5173/tip/mem-1");
    // QR 情報を足しても金額キーは一切含まれないまま（店はお金に触れない）
    expect(JSON.stringify(detail)).not.toMatch(/amount|customer_total|platform_fee|balance|payout/i);
  });

  it("getStoreStaffDetail: 店員でもある管理者は role とviewerRole を返す（owner のみ管理者操作を出す・§11.3）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 管理者(admin) でもある店員（authUserId が admin と一致）
    seedAdmin(m, "store-1", "admin-user", "2026-06-24T00:00:00Z", "admin");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "田中 管理", headline: null, avatarUrl: null, authUserId: "admin-user" },
    ]);
    // owner が見ると、対象のロール(admin)・自分のロール(owner)・対象の authUserId を得られる
    const asOwner = await getStoreStaffDetail(m.repo, buildTip, "owner-1", "store-1", "s1");
    expect(asOwner.role).toBe("admin");
    expect(asOwner.viewerRole).toBe("owner");
    expect(asOwner.authUserId).toBe("admin-user");
    // admin 自身が見ると viewerRole は admin（管理者操作は出せない）
    const asAdmin = await getStoreStaffDetail(m.repo, buildTip, "admin-user", "store-1", "s1");
    expect(asAdmin.viewerRole).toBe("admin");
  });

  it("getStoreStaffDetail: 店員だけ（管理者でない）は role が null", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null, authUserId: "plain-staff" },
    ]);
    const detail = await getStoreStaffDetail(m.repo, buildTip, "owner-1", "store-1", "s1");
    expect(detail.role).toBeNull();
    expect(detail.viewerRole).toBe("owner");
  });

  it("getStoreStaffDetail: 他店のオーナーは取得できない（店スコープ・404 相当）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null },
    ]);
    await expect(
      getStoreStaffDetail(m.repo, buildTip, "intruder", "store-1", "s1"),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  it("removeStoreStaff: 在籍解除すると在籍中一覧・スタッフ詳細から消える（論理削除・お金は移動しない）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: "ホール", avatarUrl: null },
      { id: "s2", displayName: "田中 健一", headline: "バリスタ", avatarUrl: null },
    ]);
    // 在籍解除前は2人
    expect((await listStoreStaff(m.repo, "owner-1", "store-1")).count).toBe(2);

    // s1 を在籍解除する
    await removeStoreStaff(m.repo, "owner-1", "store-1", "s1");

    // 在籍中一覧から消える（1人になる）
    const after = await listStoreStaff(m.repo, "owner-1", "store-1");
    expect(after.count).toBe(1);
    expect(after.items[0]!.id).toBe("s2");
    // 在籍解除済みは詳細も 404 相当
    await expect(
      getStoreStaffDetail(m.repo, buildTip, "owner-1", "store-1", "s1"),
    ).rejects.toBeInstanceOf(StoreStaffNotFoundError);
  });

  it("removeStoreStaff: 他店のオーナーは在籍解除できない（店スコープ）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null },
    ]);
    await expect(
      removeStoreStaff(m.repo, "intruder", "store-1", "s1"),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
    // 在籍は健在
    expect((await listStoreStaff(m.repo, "owner-1", "store-1")).count).toBe(1);
  });

  it("removeStoreStaff: 既に在籍解除済みのスタッフは 404（二重解除不可）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null },
    ]);
    await removeStoreStaff(m.repo, "owner-1", "store-1", "s1");
    await expect(
      removeStoreStaff(m.repo, "owner-1", "store-1", "s1"),
    ).rejects.toBeInstanceOf(StoreStaffNotFoundError);
  });

  it("getStoreGratitude: 期間未指定なら全期間の件数・お客さまの声・スタッフ別件数を返す（店ホーム互換）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 受取日時（件数集計用・金額なし）
    m.timesByStore.set("store-1", [
      { receivedAt: "2026-06-23T01:00:00Z" },
      { receivedAt: "2026-06-20T03:00:00Z" },
      { receivedAt: "2026-05-15T03:00:00Z" },
    ]);
    m.voicesByStore.set("store-1", [
      { id: "v1", message: "笑顔が素敵で癒されました！", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田 さくら" },
    ]);
    m.perStaffByStore.set("store-1", [
      { staffId: "s1", staffName: "山田 さくら", avatarUrl: "https://example.test/avatar-s1.png", count: 2 },
      { staffId: "s2", staffName: "田中 健一", avatarUrl: null, count: 1 },
    ]);

    const g = await getStoreGratitude(m.repo, "owner-1", "store-1", new Date("2026-06-23T03:00:00Z"));
    // 期間未指定 → 全期間の3件、今週は直近7日の2件
    expect(g.totalCount).toBe(3);
    expect(g.weekCount).toBe(2);
    expect(g.voices[0]!.message).toBe("笑顔が素敵で癒されました！");
    expect(g.voices[0]!.staffName).toBe("山田 さくら");
    expect(g.perStaff.length).toBe(2);
    // スタッフ別にアバターURL（公開URL）が乗る（金額は出さない）。無い場合は null。
    expect(g.perStaff.find((p) => p.staffId === "s1")!.avatarUrl).toBe("https://example.test/avatar-s1.png");
    expect(g.perStaff.find((p) => p.staffId === "s2")!.avatarUrl).toBeNull();
    // today/month は廃止済み（応答に含まれない）
    expect((g as Record<string, unknown>).todayCount).toBeUndefined();
    expect((g as Record<string, unknown>).monthCount).toBeUndefined();
  });

  it("getStoreGratitude: 期間（from/to）指定で totalCount・voices・perStaff がその期間に絞られる。weekCount は常に今週", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 受取日時（全期間。Model が totalCount を期間で絞り、weekCount は常に今週）
    m.timesByStore.set("store-1", [
      { receivedAt: "2026-06-23T01:00:00Z" }, // 今週・今月
      { receivedAt: "2026-06-10T03:00:00Z" }, // 今月（今週ではない）
      { receivedAt: "2026-05-15T03:00:00Z" }, // 先月
    ]);
    // お客さまの声（期間で絞られることを確認する）
    m.voicesByStore.set("store-1", [
      { id: "v-jun-1", message: "6月の声A", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田" },
      { id: "v-jun-2", message: "6月の声B", receivedAt: "2026-06-10T03:00:00Z", staffName: "山田" },
      { id: "v-may-1", message: "5月の声", receivedAt: "2026-05-15T03:00:00Z", staffName: "田中" },
    ]);
    // スタッフ別の受取日時明細（期間で件数を数え直す）
    m.perStaffTimesByStore.set("store-1", [
      { staffId: "s1", staffName: "山田", times: ["2026-06-23T01:00:00Z", "2026-06-10T03:00:00Z"] },
      { staffId: "s2", staffName: "田中", times: ["2026-05-15T03:00:00Z"] },
    ]);

    const now = new Date("2026-06-23T03:00:00Z");

    // 今月（6/1 〜 7/1 排他）
    const jun = await getStoreGratitude(m.repo, "owner-1", "store-1", now, {
      from: "2026-06-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
    });
    expect(jun.totalCount).toBe(2); // 6/23, 6/10
    expect(jun.weekCount).toBe(1); // 常に今週（6/23 のみ）
    expect(jun.voices.map((v) => v.id)).toEqual(["v-jun-1", "v-jun-2"]); // 5月の声は除外
    expect(jun.perStaff.find((p) => p.staffId === "s1")!.count).toBe(2);
    expect(jun.perStaff.find((p) => p.staffId === "s2")!.count).toBe(0);

    // 先月（5/1 〜 6/1 排他）
    const may = await getStoreGratitude(m.repo, "owner-1", "store-1", now, {
      from: "2026-05-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    expect(may.totalCount).toBe(1); // 5/15
    expect(may.weekCount).toBe(1); // 先月を選んでも今週は今週のまま
    expect(may.voices.map((v) => v.id)).toEqual(["v-may-1"]);
    expect(may.perStaff.find((p) => p.staffId === "s1")!.count).toBe(0);
    expect(may.perStaff.find((p) => p.staffId === "s2")!.count).toBe(1);
  });

  it("getStoreGratitude: staffId 指定で voices がそのスタッフに絞られる。perStaff・totalCount・weekCount は不変", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 受取日時（件数集計用・全期間）
    m.timesByStore.set("store-1", [
      { receivedAt: "2026-06-23T01:00:00Z" },
      { receivedAt: "2026-06-22T03:00:00Z" },
      { receivedAt: "2026-06-21T03:00:00Z" },
    ]);
    // 声に staffId を持たせる（s1 が2件・s2 が1件）
    m.voicesByStore.set("store-1", [
      { id: "v-s1-a", message: "山田さんへA", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田", staffId: "s1" },
      { id: "v-s1-b", message: null, receivedAt: "2026-06-22T03:00:00Z", staffName: "山田", staffId: "s1" },
      { id: "v-s2-a", message: "田中さんへ", receivedAt: "2026-06-21T03:00:00Z", staffName: "田中", staffId: "s2" },
    ]);
    // perStaff（全スタッフ集計・名簿順）。staffId 絞りでこれは変わってはいけない
    m.perStaffByStore.set("store-1", [
      { staffId: "s1", staffName: "山田", avatarUrl: null, count: 2 },
      { staffId: "s2", staffName: "田中", avatarUrl: null, count: 1 },
    ]);

    const now = new Date("2026-06-23T03:00:00Z");

    // staffId 指定なし（全スタッフ）→ voices は全件
    const all = await getStoreGratitude(m.repo, "owner-1", "store-1", now);
    expect(all.voices.map((v) => v.id)).toEqual(["v-s1-a", "v-s1-b", "v-s2-a"]);

    // staffId = s1 → voices は s1 の2件だけ（メッセージなしも含む）
    const onlyS1 = await getStoreGratitude(m.repo, "owner-1", "store-1", now, { staffId: "s1" });
    expect(onlyS1.voices.map((v) => v.id)).toEqual(["v-s1-a", "v-s1-b"]);
    // メッセージなしの声もそのまま残る（フロントで「メッセージなし」表示）
    expect(onlyS1.voices.find((v) => v.id === "v-s1-b")!.message).toBeNull();
    // perStaff・totalCount・weekCount は staffId に関わらず不変（全スタッフ集計のまま）
    expect(onlyS1.perStaff).toEqual(all.perStaff);
    expect(onlyS1.totalCount).toBe(all.totalCount);
    expect(onlyS1.weekCount).toBe(all.weekCount);

    // staffId = s2 → voices は s2 の1件だけ
    const onlyS2 = await getStoreGratitude(m.repo, "owner-1", "store-1", now, { staffId: "s2" });
    expect(onlyS2.voices.map((v) => v.id)).toEqual(["v-s2-a"]);
    expect(onlyS2.perStaff).toEqual(all.perStaff);
  });

  it("getStoreGratitude: staffId と期間（from/to）を併用すると voices がスタッフ×期間で絞られる", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.timesByStore.set("store-1", [
      { receivedAt: "2026-06-23T01:00:00Z" },
      { receivedAt: "2026-05-15T03:00:00Z" },
    ]);
    m.voicesByStore.set("store-1", [
      { id: "v-s1-jun", message: "6月の山田さんへ", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田", staffId: "s1" },
      { id: "v-s1-may", message: "5月の山田さんへ", receivedAt: "2026-05-15T03:00:00Z", staffName: "山田", staffId: "s1" },
      { id: "v-s2-jun", message: "6月の田中さんへ", receivedAt: "2026-06-23T01:00:00Z", staffName: "田中", staffId: "s2" },
    ]);
    m.perStaffByStore.set("store-1", [
      { staffId: "s1", staffName: "山田", avatarUrl: null, count: 2 },
      { staffId: "s2", staffName: "田中", avatarUrl: null, count: 1 },
    ]);

    const now = new Date("2026-06-23T03:00:00Z");

    // s1 ×今月（6/1〜7/1）→ 6月の s1 だけ（5月分・他スタッフは除外）
    const s1Jun = await getStoreGratitude(m.repo, "owner-1", "store-1", now, {
      from: "2026-06-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
      staffId: "s1",
    });
    expect(s1Jun.voices.map((v) => v.id)).toEqual(["v-s1-jun"]);
  });

  it("金額非表示: 感謝の可視化の応答に金額・残高・着金キーが一切含まれない", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.timesByStore.set("store-1", [{ receivedAt: "2026-06-23T01:00:00Z" }]);
    m.voicesByStore.set("store-1", [
      { id: "v1", message: "ありがとう", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田" },
    ]);
    m.perStaffByStore.set("store-1", [{ staffId: "s1", staffName: "山田", avatarUrl: null, count: 1 }]);

    const g = await getStoreGratitude(m.repo, "owner-1", "store-1", new Date("2026-06-23T03:00:00Z"));
    const json = JSON.stringify(g);
    // 金額・支払額・手数料・残高・着金・payout を表すキーが無い
    expect(json).not.toMatch(/amount/i);
    expect(json).not.toMatch(/customer_?total/i);
    expect(json).not.toMatch(/platform_?fee/i);
    expect(json).not.toMatch(/balance/i);
    expect(json).not.toMatch(/payout/i);
    expect(json).not.toMatch(/settlement/i);
    // ¥ や 円 の金額表記も無い
    expect(json).not.toMatch(/[¥]|円/);
  });

  it("updateStore: 名前・紹介・業種を更新し、空文字の任意項目は null に正規化する", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const updated = await updateStore(m.repo, "owner-1", "store-1", {
      name: "  新しい店名 ",
      description: "  ",
      industry: "カフェ・喫茶",
    });
    expect(updated.name).toBe("新しい店名");
    expect(updated.description).toBeNull();
    expect(updated.industry).toBe("カフェ・喫茶");
  });

  // ── 権限（requireStoreAdmin / requireStoreOwner）のスコープ ──

  it("requireStoreAdmin: active な admin は日常運用（店情報取得・更新）ができる", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    // admin でも getStore / updateStore（日常運用）は通る
    expect((await getStore(m.repo, "admin-1", "store-1")).id).toBe("store-1");
    const updated = await updateStore(m.repo, "admin-1", "store-1", { name: "admin 更新" });
    expect(updated.name).toBe("admin 更新");
  });

  it("requireStoreAdmin: 非管理者は 403 相当（他人は日常運用もできない）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await expect(getStore(m.repo, "stranger", "store-1")).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  // ── 店の論理削除（閉店） ──

  it("closeStore: owner が閉店すると解決から除外され、所属（QR）が無効化される（履歴は保全）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null },
    ]);
    // 閉店前は在籍1人・自分の店として引ける
    expect((await listStoreStaff(m.repo, "owner-1", "store-1")).count).toBe(1);
    expect((await getMyStore(m.repo, "owner-1"))?.id).toBe("store-1");

    await closeStore(m.repo, "owner-1", "store-1");

    // 閉店後は自分の店の解決から除外（getMyStore は null）
    expect(await getMyStore(m.repo, "owner-1")).toBeNull();
    // 閉店店は日常運用の対象からも外れる（404 相当）
    await expect(getStore(m.repo, "owner-1", "store-1")).rejects.toBeInstanceOf(StoreNotFoundError);
    // 店行自体は残る（物理削除しない＝履歴保全）
    expect((await m.repo.findStoreById("store-1"))?.closedAt).not.toBeNull();
  });

  it("closeStore: owner でない管理者(admin)は閉店できない（owner 専用）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    await expect(closeStore(m.repo, "admin-1", "store-1")).rejects.toBeInstanceOf(StoreForbiddenError);
    // 店はまだ営業中
    expect((await m.repo.findStoreById("store-1"))?.closedAt).toBeNull();
  });

  it("closeStore: 他店・非管理者は 404/403 相当（閉店できない）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    await expect(closeStore(m.repo, "stranger", "store-1")).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  // ── owner 譲渡 ──

  it("transferStoreOwner: owner が admin を指名して譲渡すると role が入れ替わる（owner は常に1人）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");

    await transferStoreOwner(m.repo, "owner-1", "store-1", "admin-1");

    // 現 owner は admin へ、対象は owner へ
    expect(await m.repo.findActiveAdminRole("store-1", "owner-1")).toBe("admin");
    expect(await m.repo.findActiveAdminRole("store-1", "admin-1")).toBe("owner");
    // active な owner は1人だけ（不変条件）
    const owners = (await m.repo.listActiveAdmins("store-1")).filter((a) => a.role === "owner");
    expect(owners.length).toBe(1);
    expect(owners[0]!.authUserId).toBe("admin-1");
    // 新 owner は owner 専用操作（閉店）ができ、旧 owner はできない
    await expect(closeStore(m.repo, "owner-1", "store-1")).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  it("transferStoreOwner: 指名先が active な admin でなければ StoreAdminNotFoundError", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 存在しない相手
    await expect(
      transferStoreOwner(m.repo, "owner-1", "store-1", "no-such"),
    ).rejects.toBeInstanceOf(StoreAdminNotFoundError);
  });

  it("transferStoreOwner: owner でない管理者(admin)は譲渡できない（owner 専用）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    seedAdmin(m, "store-1", "admin-2", "2026-06-25T00:00:00Z");
    await expect(
      transferStoreOwner(m.repo, "admin-1", "store-1", "admin-2"),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  // ── owner 離脱／消失時の自動継承・自動削除 ──

  it("handleOwnerDeparture: 残る管理者がいれば最古参（created_at 最小）を owner へ自動昇格する", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    // 新しい方を先に足して、最古参が古参順で選ばれることを確認する
    seedAdmin(m, "store-1", "admin-new", "2026-06-25T00:00:00Z");
    seedAdmin(m, "store-1", "admin-old", "2026-06-24T00:00:00Z");

    const result = await handleOwnerDeparture(m.repo, "store-1", "owner-1");

    expect(result).toEqual({ action: "promoted", newOwnerAuthUserId: "admin-old" });
    // 旧 owner は外れ、最古参が owner に
    expect(await m.repo.findActiveAdminRole("store-1", "owner-1")).toBeNull();
    expect(await m.repo.findActiveAdminRole("store-1", "admin-old")).toBe("owner");
    expect(await m.repo.findActiveAdminRole("store-1", "admin-new")).toBe("admin");
    // 店は生きたまま（閉店しない）
    expect((await m.repo.findStoreById("store-1"))?.closedAt).toBeNull();
    // owner は1人だけ
    const owners = (await m.repo.listActiveAdmins("store-1")).filter((a) => a.role === "owner");
    expect(owners.length).toBe(1);
  });

  it("handleOwnerDeparture: 管理者が誰もいなければ店を論理削除（閉店）する", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: null, avatarUrl: null },
    ]);

    const result = await handleOwnerDeparture(m.repo, "store-1", "owner-1");

    expect(result).toEqual({ action: "closed" });
    // 店は閉店（論理削除）され、解決から外れる
    expect((await m.repo.findStoreById("store-1"))?.closedAt).not.toBeNull();
    expect(await getMyStore(m.repo, "owner-1")).toBeNull();
  });
});

// 店ロゴ画像アップロード（POST /store/:storeId/logo）のユースケース検証。
// オーナースコープ・検証（MIME・サイズ）・Storage 保存・logo_url 更新・公開URL返却を確認する。
describe("store.service uploadStoreLogo", () => {
  let m: ReturnType<typeof createMockRepo>;
  const fakeUpload = vi.fn(async (params: { path: string; body: ArrayBuffer | Uint8Array; contentType: string }) => ({
    path: params.path,
    publicUrl: `https://example.test/storage/v1/object/public/media/${params.path}`,
  }));

  beforeEach(() => {
    m = createMockRepo();
    fakeUpload.mockClear();
    seedOwnedStore(m, "store-1", "owner-1");
  });

  it("画像を保存し、公開URLで logo_url を更新して返す（logos/<storeId>/ 配下）", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    const result = await uploadStoreLogo(m.repo, fakeUpload, "owner-1", "store-1", {
      body: png,
      contentType: "image/png",
    });
    expect(result.logoUrl).toMatch(/^https:\/\/example\.test\//);
    const callPath = fakeUpload.mock.calls[0]![0].path;
    expect(callPath).toMatch(/^logos\/store-1\/[0-9a-f-]+\.png$/);
    // store の logo_url が公開URLに更新されている
    const store = await getStore(m.repo, "owner-1", "store-1");
    expect(store.logoUrl).toBe(result.logoUrl);
  });

  it("他店（別オーナー）のロゴは変えられない（StoreForbiddenError）。Storage は呼ばない", async () => {
    await expect(
      uploadStoreLogo(m.repo, fakeUpload, "intruder", "store-1", {
        body: new Uint8Array([0x89]).buffer,
        contentType: "image/png",
      }),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it("非画像 MIME は 400 相当（InvalidImageError）。Storage は呼ばない", async () => {
    await expect(
      uploadStoreLogo(m.repo, fakeUpload, "owner-1", "store-1", {
        body: new Uint8Array([1, 2, 3]).buffer,
        contentType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(fakeUpload).not.toHaveBeenCalled();
  });

  it("サイズ上限（5MB）超過は 400 相当（InvalidImageError）", async () => {
    await expect(
      uploadStoreLogo(m.repo, fakeUpload, "owner-1", "store-1", {
        body: new Uint8Array(5 * 1024 * 1024 + 1).buffer,
        contentType: "image/png",
      }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    expect(fakeUpload).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// フェーズ3: 管理者招待の発行権限・管理者一覧/削除・owner 離脱の UI トリガ
// ─────────────────────────────────────────────────────────────
describe("store.service（管理者管理・フェーズ3）", () => {
  let m: ReturnType<typeof createMockRepo>;
  beforeEach(() => {
    m = createMockRepo();
  });

  it("発行権限: スタッフ招待（createStoreInvite）は owner も管理者(admin)も発行できる", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    // owner が発行できる
    const byOwner = await createStoreInvite(m.repo, buildUrl, "owner-1", "store-1", {});
    expect(byOwner.code).toBeTruthy();
    // 管理者(admin)も発行できる（requireStoreAdmin）
    const byAdmin = await createStoreInvite(m.repo, buildUrl, "admin-1", "store-1", {});
    expect(byAdmin.code).toBeTruthy();
  });

  it("発行権限: 管理者招待（createStoreAdminInvite）は owner のみ発行できる（admin は 403 相当）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    // owner は発行できる
    const invite = await createStoreAdminInvite(m.repo, buildUrl, "owner-1", "store-1", {});
    expect(invite.code).toBeTruthy();
    expect(invite.inviteUrl).toContain("/invite/");
    // 管理者(admin)は発行できない（requireStoreOwner → StoreForbiddenError）
    await expect(
      createStoreAdminInvite(m.repo, buildUrl, "admin-1", "store-1", {}),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
    // 非管理者も発行できない
    await expect(
      createStoreAdminInvite(m.repo, buildUrl, "stranger", "store-1", {}),
    ).rejects.toBeInstanceOf(StoreForbiddenError);
  });

  it("listStoreAdmins: owner 先頭・管理者を古参順で返し、viewerRole と isSelf を付ける", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-2", "2026-06-26T00:00:00Z");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");

    // owner から見た一覧
    const asOwner = await listStoreAdmins(m.repo, "owner-1", "store-1");
    expect(asOwner.viewerRole).toBe("owner");
    // owner が先頭、その後 admin を古参順（admin-1 が admin-2 より古い）
    expect(asOwner.items.map((a) => a.authUserId)).toEqual(["owner-1", "admin-1", "admin-2"]);
    expect(asOwner.items[0]!.role).toBe("owner");
    expect(asOwner.items.find((a) => a.authUserId === "owner-1")!.isSelf).toBe(true);
    expect(asOwner.items.find((a) => a.authUserId === "admin-1")!.isSelf).toBe(false);

    // admin から見ると viewerRole=admin（一覧は閲覧できる）
    const asAdmin = await listStoreAdmins(m.repo, "admin-1", "store-1");
    expect(asAdmin.viewerRole).toBe("admin");
    expect(asAdmin.items.find((a) => a.authUserId === "admin-1")!.isSelf).toBe(true);

    // 非管理者は 404 相当（StoreForbiddenError）
    await expect(listStoreAdmins(m.repo, "stranger", "store-1")).rejects.toBeInstanceOf(
      StoreForbiddenError,
    );
  });

  it("removeStoreAdmin: owner が管理者(admin)を外せる。owner・非管理者・他店は不可", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");

    // 管理者(admin)は管理者を外せない（requireStoreOwner）
    await expect(
      removeStoreAdmin(m.repo, "admin-1", "store-1", "admin-1"),
    ).rejects.toBeInstanceOf(StoreForbiddenError);

    // owner が admin-1 を外せる
    await removeStoreAdmin(m.repo, "owner-1", "store-1", "admin-1");
    const after = await listStoreAdmins(m.repo, "owner-1", "store-1");
    expect(after.items.map((a) => a.authUserId)).toEqual(["owner-1"]);

    // 既に外れた admin をもう一度外す → StoreAdminNotFoundError
    await expect(
      removeStoreAdmin(m.repo, "owner-1", "store-1", "admin-1"),
    ).rejects.toBeInstanceOf(StoreAdminNotFoundError);

    // owner 自身は removeAdmin では外せない（role=admin のみ対象）→ StoreAdminNotFoundError
    await expect(
      removeStoreAdmin(m.repo, "owner-1", "store-1", "owner-1"),
    ).rejects.toBeInstanceOf(StoreAdminNotFoundError);
  });

  it("leaveStoreAsOwner: 残る管理者がいれば最古参を owner へ自動昇格（promoted）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-late", "2026-06-26T00:00:00Z");
    seedAdmin(m, "store-1", "admin-old", "2026-06-24T00:00:00Z");

    const result = await leaveStoreAsOwner(m.repo, "owner-1", "store-1");
    expect(result.action).toBe("promoted");
    // 最古参（admin-old）が新 owner
    expect(result.newOwnerAuthUserId).toBe("admin-old");
    // 旧 owner はもう管理者ではない（active な store_admin から外れる）
    const admins = await listStoreAdmins(m.repo, "admin-old", "store-1");
    expect(admins.viewerRole).toBe("owner");
    expect(admins.items.some((a) => a.authUserId === "owner-1")).toBe(false);
  });

  it("leaveStoreAsOwner: 残る管理者がいなければ店を閉店（closed）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    const result = await leaveStoreAsOwner(m.repo, "owner-1", "store-1");
    expect(result.action).toBe("closed");
    expect(result.newOwnerAuthUserId).toBeNull();
    // 閉店済みの店は自分の店として引けない
    expect(await getMyStore(m.repo, "owner-1")).toBeNull();
  });

  it("leaveStoreAsOwner: 管理者(admin)・非管理者は不可（owner 専用）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    seedAdmin(m, "store-1", "admin-1", "2026-06-24T00:00:00Z");
    await expect(leaveStoreAsOwner(m.repo, "admin-1", "store-1")).rejects.toBeInstanceOf(
      StoreForbiddenError,
    );
    await expect(leaveStoreAsOwner(m.repo, "stranger", "store-1")).rejects.toBeInstanceOf(
      StoreForbiddenError,
    );
  });
});
