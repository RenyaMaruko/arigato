import { randomUUID } from "node:crypto";
import type {
  StoreRepository,
  StoreRow,
  StoreInviteRow,
  StoreStaffRow,
} from "./store.repository.js";

/**
 * store feature の Repository インメモリ実装。
 * DATABASE_URL が無い環境（ローカル疎通・一部テスト）でも Service を動かせるようにする。
 * 実 DB 実装（createStoreRepository）と同じ契約（StoreRepository）を満たす差し替え。
 *
 * 最重要原則は実 DB 実装と同じ: 金額・残高・着金は一切持たず、感謝は件数・メッセージ・店員名だけを扱う。
 * 開発用シード店は環境変数 SEED_STORE_ID / SEED_STORE_NAME から最小限を投入できる（未設定なら空）。
 */
export function createInMemoryStoreRepository(): StoreRepository {
  // 店の簡易ストア（id をキー）
  const stores = new Map<string, StoreRow>();
  // 招待の簡易ストア（store_id ごとに保持）
  const invitesByStore = new Map<string, StoreInviteRow[]>();
  // スタッフの簡易ストア（store_id ごとに保持）
  const staffByStore = new Map<string, StoreStaffRow[]>();

  // 開発用シード店（任意）。owner 未紐付け・導入承認未同意の移行相当の店を1件用意する
  const seedStoreId = process.env.SEED_STORE_ID;
  if (seedStoreId) {
    stores.set(seedStoreId, {
      id: seedStoreId,
      name: process.env.SEED_STORE_NAME ?? "テスト店",
      description: null,
      industry: null,
      logoUrl: null,
      adoptionAgreedAt: null,
      ownerAuthUserId: null,
    });
  }

  return {
    async findStoreById(storeId) {
      return stores.get(storeId) ?? null;
    },

    async findStoreByOwner(authUserId) {
      for (const store of stores.values()) {
        if (store.ownerAuthUserId === authUserId) return store;
      }
      return null;
    },

    async createStore(params) {
      // セルフサーブ作成（作成者＝所有者・導入承認に同意済み）
      const id = randomUUID();
      const created: StoreRow = {
        id,
        name: params.name,
        description: params.description,
        industry: params.industry,
        logoUrl: params.logoUrl,
        adoptionAgreedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        ownerAuthUserId: params.ownerAuthUserId,
      };
      stores.set(id, created);
      return created;
    },

    async updateStore(storeId, params) {
      const store = stores.get(storeId);
      if (!store) return null;
      const updated: StoreRow = {
        ...store,
        name: params.name,
        description: params.description,
        industry: params.industry,
        logoUrl: params.logoUrl,
      };
      stores.set(storeId, updated);
      return updated;
    },

    async createInvite(storeId, code) {
      const invite: StoreInviteRow = {
        code,
        status: "pending",
        createdAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
        acceptedStaffName: null,
        acceptedAt: null,
      };
      const list = invitesByStore.get(storeId) ?? [];
      // 新しい順に保つため先頭に積む
      list.unshift(invite);
      invitesByStore.set(storeId, list);
      return invite;
    },

    async listInvites(storeId) {
      // 既に新しい順で保持している
      return [...(invitesByStore.get(storeId) ?? [])];
    },

    async listStaff(storeId) {
      // 名簿順（追加順）で保持している
      return [...(staffByStore.get(storeId) ?? [])];
    },

    // インメモリでは投げ銭データを持たないため、感謝は空集合（実運用は実 DB を使う）
    async listGratitudeVoices() {
      return [];
    },
    async listGratitudeTimes() {
      return [];
    },
    async listGratitudePerStaff(storeId) {
      // スタッフはいるが投げ銭は無いので件数 0 を名簿順で返す
      return (staffByStore.get(storeId) ?? []).map((s) => ({
        staffId: s.id,
        staffName: s.displayName,
        count: 0,
      }));
    },
  };
}

// インメモリ用のユーティリティ ID 生成（テスト・シードで使う）
export function newMemoryId(): string {
  return randomUUID();
}
