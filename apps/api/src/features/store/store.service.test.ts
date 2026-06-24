import { describe, it, expect, beforeEach } from "vitest";
import {
  getMyStore,
  createStore,
  getStore,
  updateStore,
  createStoreInvite,
  listStoreInvites,
  listStoreStaff,
  getStoreGratitude,
  StoreForbiddenError,
  StoreAlreadyExistsError,
} from "./store.service.js";
import { buildInviteUrl } from "./store.model.js";
import type {
  StoreRepository,
  StoreRow,
  StoreInviteRow,
  StoreStaffRow,
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

// テスト用のモック Repository（実 DB を使わず Service のロジックを検証する）
function createMockRepo() {
  const stores = new Map<string, StoreRow>();
  const invitesByStore = new Map<string, StoreInviteRow[]>();
  const staffByStore = new Map<string, StoreStaffRow[]>();
  const voicesByStore = new Map<string, GratitudeVoiceRow[]>();
  const timesByStore = new Map<string, GratitudeTimeRow[]>();
  const perStaffByStore = new Map<string, GratitudePerStaffRow[]>();

  const repo: StoreRepository = {
    async findStoreById(storeId) {
      return stores.get(storeId) ?? null;
    },
    async findStoreByOwner(authUserId) {
      for (const s of stores.values()) {
        if (s.ownerAuthUserId === authUserId) return s;
      }
      return null;
    },
    async createStore(params) {
      const id = `store-${stores.size + 1}`;
      const created: StoreRow = {
        id,
        name: params.name,
        description: params.description,
        industry: params.industry,
        logoUrl: params.logoUrl,
        adoptionAgreedAt: "2026-06-23T00:00:00Z",
        ownerAuthUserId: params.ownerAuthUserId,
      };
      stores.set(id, created);
      return created;
    },
    async updateStore(storeId, params) {
      const s = stores.get(storeId);
      if (!s) return null;
      const updated: StoreRow = { ...s, ...params };
      stores.set(storeId, updated);
      return updated;
    },
    async createInvite(storeId, code) {
      const invite: StoreInviteRow = {
        code,
        status: "pending",
        createdAt: "2026-06-23T00:00:00Z",
        acceptedStaffName: null,
        acceptedAt: null,
      };
      const list = invitesByStore.get(storeId) ?? [];
      list.unshift(invite);
      invitesByStore.set(storeId, list);
      return invite;
    },
    async listInvites(storeId) {
      return [...(invitesByStore.get(storeId) ?? [])];
    },
    async listStaff(storeId) {
      return [...(staffByStore.get(storeId) ?? [])];
    },
    async listGratitudeVoices(storeId, limit) {
      return (voicesByStore.get(storeId) ?? []).slice(0, limit);
    },
    async listGratitudeTimes(storeId) {
      return [...(timesByStore.get(storeId) ?? [])];
    },
    async listGratitudePerStaff(storeId) {
      return [...(perStaffByStore.get(storeId) ?? [])];
    },
  };

  return { repo, stores, invitesByStore, staffByStore, voicesByStore, timesByStore, perStaffByStore };
}

// 所有者付きの店を1件用意するヘルパ（既に作成済みの店をシードする）
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
    ownerAuthUserId,
  });
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

  it("createStore: 1アカウント1店舗（既に作成済みなら拒否）", async () => {
    await createStore(m.repo, "owner-1", { name: "1号店", adoptionAgreed: true });
    // 同じアカウントの2回目は拒否
    await expect(
      createStore(m.repo, "owner-1", { name: "2号店", adoptionAgreed: true }),
    ).rejects.toBeInstanceOf(StoreAlreadyExistsError);
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

  it("listStoreStaff: 自店の所属スタッフを名簿順で返す（金額・件数なし）", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.staffByStore.set("store-1", [
      { id: "s1", displayName: "山田 さくら", headline: "ホール", avatarUrl: null },
      { id: "s2", displayName: "田中 健一", headline: "バリスタ", avatarUrl: null },
    ]);
    const res = await listStoreStaff(m.repo, "owner-1", "store-1");
    expect(res.count).toBe(2);
    expect(res.items[0]!.displayName).toBe("山田 さくら");
    // 金額や件数のキーが含まれない
    const json = JSON.stringify(res);
    expect(json).not.toMatch(/amount|customer_total|platform_fee|balance|payout/i);
  });

  it("getStoreGratitude: 件数・お客さまの声・スタッフ別件数を返す", async () => {
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
      { staffId: "s1", staffName: "山田 さくら", count: 2 },
      { staffId: "s2", staffName: "田中 健一", count: 1 },
    ]);

    const g = await getStoreGratitude(m.repo, "owner-1", "store-1", new Date("2026-06-23T03:00:00Z"));
    expect(g.totalCount).toBe(3);
    expect(g.todayCount).toBe(1);
    expect(g.weekCount).toBe(2);
    expect(g.monthCount).toBe(2);
    expect(g.voices[0]!.message).toBe("笑顔が素敵で癒されました！");
    expect(g.voices[0]!.staffName).toBe("山田 さくら");
    expect(g.perStaff.length).toBe(2);
  });

  it("金額非表示: 感謝の可視化の応答に金額・残高・着金キーが一切含まれない", async () => {
    seedOwnedStore(m, "store-1", "owner-1");
    m.timesByStore.set("store-1", [{ receivedAt: "2026-06-23T01:00:00Z" }]);
    m.voicesByStore.set("store-1", [
      { id: "v1", message: "ありがとう", receivedAt: "2026-06-23T01:00:00Z", staffName: "山田" },
    ]);
    m.perStaffByStore.set("store-1", [{ staffId: "s1", staffName: "山田", count: 1 }]);

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
});
