import { randomUUID } from "node:crypto";
import type {
  StoreRepository,
  StoreRow,
  StoreInviteRow,
  StoreStaffRow,
  StoreAdminRow,
} from "./store.repository.js";
import type { StoreRole } from "./store.model.js";

/**
 * store feature の Repository インメモリ実装。
 * DATABASE_URL が無い環境（ローカル疎通・一部テスト）でも Service を動かせるようにする。
 * 実 DB 実装（createStoreRepository）と同じ契約（StoreRepository）を満たす差し替え。
 *
 * 最重要原則は実 DB 実装と同じ: 金額・残高・着金は一切持たず、感謝は件数・メッセージ・店員名だけを扱う。
 * owner 表現は store_admin（人×店×ロール）で持ち、閉店は store.closedAt で表す。
 */
export function createInMemoryStoreRepository(): StoreRepository {
  // 店の簡易ストア（id をキー）
  const stores = new Map<string, StoreRow>();
  // 招待の簡易ストア（store_id ごとに保持）
  const invitesByStore = new Map<string, StoreInviteRow[]>();
  // スタッフの簡易ストア（store_id ごとに保持）。leftAt は論理削除（在籍解除）の時刻（null＝在籍中）。
  const staffByStore = new Map<string, (StoreStaffRow & { joinedAt: string; leftAt: number | null })[]>();
  // 店の管理者（store_admin）。store_id ごとに保持。leftAt は論理削除（null＝active）。
  const adminsByStore = new Map<
    string,
    { authUserId: string; role: StoreRole; createdAt: string; leftAt: number | null }[]
  >();

  // 開発用シード店（任意）。導入承認未同意の移行相当の店を1件用意する
  const seedStoreId = process.env.SEED_STORE_ID;
  if (seedStoreId) {
    stores.set(seedStoreId, {
      id: seedStoreId,
      name: process.env.SEED_STORE_NAME ?? "テスト店",
      description: null,
      industry: null,
      logoUrl: null,
      adoptionAgreedAt: null,
      closedAt: null,
    });
  }

  return {
    async findStoreById(storeId) {
      return stores.get(storeId) ?? null;
    },

    // 自分が active な管理者である店を返す（owner 優先→古参順、閉店店は除外）
    async findStoreForAdmin(authUserId) {
      let best: { store: StoreRow; isOwner: boolean; createdAt: string } | null = null;
      for (const [storeId, admins] of adminsByStore) {
        const store = stores.get(storeId);
        if (!store || store.closedAt !== null) continue;
        const mine = admins.find((a) => a.authUserId === authUserId && a.leftAt === null);
        if (!mine) continue;
        const isOwner = mine.role === "owner";
        // owner を優先し、次に古参（createdAt 小）を選ぶ
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

    // 店を作成し、同時に作成者を owner にする
    async createStoreWithOwner(params) {
      const id = randomUUID();
      const created: StoreRow = {
        id,
        name: params.name,
        description: params.description,
        industry: params.industry,
        logoUrl: params.logoUrl,
        adoptionAgreedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        closedAt: null,
      };
      stores.set(id, created);
      adminsByStore.set(id, [
        {
          authUserId: params.creatorAuthUserId,
          role: "owner",
          createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
          leftAt: null,
        },
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
        .map<StoreAdminRow>((a) => ({
          authUserId: a.authUserId,
          role: a.role,
          createdAt: a.createdAt,
        }));
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
      const closed: StoreRow = {
        ...store,
        closedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      };
      stores.set(storeId, closed);
      // 在籍中の所属（QR）を無効化する
      for (const s of staffByStore.get(storeId) ?? []) {
        if (s.leftAt === null) s.leftAt = Date.now();
      }
      // active な管理者を外す
      for (const a of adminsByStore.get(storeId) ?? []) {
        if (a.leftAt === null) a.leftAt = Date.now();
      }
      return closed;
    },

    async updateStore(storeId, params) {
      const store = stores.get(storeId);
      if (!store) return null;
      const updated: StoreRow = {
        ...store,
        name: params.name,
        description: params.description,
        industry: params.industry,
        // ロゴは別経路で更新するためテキスト編集では消さない（値が来た時だけ差し替え・実 DB の COALESCE と整合）
        logoUrl: params.logoUrl ?? store.logoUrl,
      };
      stores.set(storeId, updated);
      return updated;
    },

    // 自店のロゴ画像URL（公開URL）を更新する（画像アップロード後）
    async setLogoUrl(storeId, logoUrl) {
      const store = stores.get(storeId);
      if (!store) return;
      stores.set(storeId, { ...store, logoUrl });
    },

    async createInvite(storeId, code, label) {
      const invite: StoreInviteRow = {
        code,
        status: "pending",
        createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        acceptedStaffName: null,
        acceptedAt: null,
        // 誰宛かの任意メモ（未入力は null）
        label: label ?? null,
      };
      const list = invitesByStore.get(storeId) ?? [];
      // 新しい順に保つため先頭に積む
      list.unshift(invite);
      invitesByStore.set(storeId, list);
      return invite;
    },

    async listInvites(storeId) {
      // 招待中（pending）だけを新しい順に返す（accepted/revoked は二重表示・履歴管理しないため除く）
      return (invitesByStore.get(storeId) ?? []).filter((i) => i.status === "pending");
    },

    async findInviteByCode(storeId, code) {
      // 自店の pending 招待だけを対象にする（再コピー・取り消しの対象確認）
      const list = invitesByStore.get(storeId) ?? [];
      return list.find((i) => i.code === code && i.status === "pending") ?? null;
    },

    async revokeInvite(storeId, code) {
      // 自店の pending 招待を revoked に更新する。更新できた件数を返す
      const list = invitesByStore.get(storeId) ?? [];
      const target = list.find((i) => i.code === code && i.status === "pending");
      if (!target) return 0;
      target.status = "revoked";
      return 1;
    },

    async listStaff(storeId) {
      // 名簿順（追加順）で在籍中（leftAt === null）のみ返す
      return (staffByStore.get(storeId) ?? [])
        .filter((s) => s.leftAt === null)
        .map((s) => ({
          id: s.id,
          displayName: s.displayName,
          headline: s.headline,
          avatarUrl: s.avatarUrl,
        }));
    },

    // 在籍中スタッフ1人の詳細を返す（脱退済み・他店・存在しないは null）
    async findStaffDetail(storeId, staffId) {
      const s = (staffByStore.get(storeId) ?? []).find(
        (x) => x.id === staffId && x.leftAt === null,
      );
      if (!s) return null;
      return {
        id: s.id,
        displayName: s.displayName,
        headline: s.headline,
        avatarUrl: s.avatarUrl,
        joinedAt: s.joinedAt,
      };
    },

    // 自店のスタッフを在籍解除する（論理削除）。在籍中のみ対象。解除できた件数を返す
    async removeStaff(storeId, staffId) {
      const s = (staffByStore.get(storeId) ?? []).find(
        (x) => x.id === staffId && x.leftAt === null,
      );
      if (!s) return 0;
      s.leftAt = Date.now();
      return 1;
    },

    // インメモリでは投げ銭データを持たないため、感謝は空集合（実運用は実 DB を使う）
    async listGratitudeVoices() {
      return [];
    },
    async listGratitudeTimes() {
      return [];
    },
    async listGratitudePerStaff(storeId) {
      // 在籍中スタッフはいるが投げ銭は無いので件数 0 を名簿順で返す（脱退者は外す）
      return (staffByStore.get(storeId) ?? [])
        .filter((s) => s.leftAt === null)
        .map((s) => ({
          staffId: s.id,
          staffName: s.displayName,
          avatarUrl: s.avatarUrl,
          count: 0,
        }));
    },
  };
}

// インメモリ用のユーティリティ ID 生成（テスト・シードで使う）
export function newMemoryId(): string {
  return randomUUID();
}
