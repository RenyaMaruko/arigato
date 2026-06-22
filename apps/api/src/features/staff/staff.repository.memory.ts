import { randomUUID } from "node:crypto";
import type {
  StaffRepository,
  InviteRow,
  StaffProfileRow,
} from "./staff.repository.js";

/**
 * staff feature の Repository インメモリ実装。
 * DATABASE_URL が無い環境（ローカル疎通・一部テスト）でも Service を動かせるようにする。
 * 実 DB 実装（createStaffRepository）と同じ契約（StaffRepository）を満たす差し替え。
 *
 * 招待・店の初期データは環境変数 SEED_INVITE_CODE / SEED_STORE_NAME から最小限を投入できる
 * （未設定なら空。実運用は実 DB を使う）。
 */
export function createInMemoryStaffRepository(): StaffRepository {
  // 招待の簡易ストア（code をキー）
  const invites = new Map<string, InviteRow>();
  // staff の簡易ストア（authUserId をキー）
  const staffByAuth = new Map<string, StaffProfileRow>();

  // 開発用シード招待（任意）。承認済み店の pending 招待を1件用意する
  const seedCode = process.env.SEED_INVITE_CODE;
  if (seedCode) {
    invites.set(seedCode, {
      code: seedCode,
      storeId: randomUUID(),
      storeName: process.env.SEED_STORE_NAME ?? "テスト店",
      inviteStatus: "pending",
      storeStatus: "approved",
    });
  }

  return {
    async findInviteByCode(code) {
      return invites.get(code) ?? null;
    },

    async findStaffByAuthUserId(authUserId) {
      return staffByAuth.get(authUserId) ?? null;
    },

    async createStaffWithInvite(code, params) {
      const invite = invites.get(code);
      // 二重消費の防止（pending 以外は使えない）
      if (!invite || invite.inviteStatus !== "pending") {
        throw new Error("invite_not_usable");
      }
      const id = randomUUID();
      const row: StaffProfileRow = {
        id,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
        storeId: params.storeId,
        storeName: invite.storeName,
        identityStatus: "none",
      };
      // 招待を消費し、staff を登録する
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      staffByAuth.set(params.authUserId, row);
      return row;
    },

    async updateStaffProfile(authUserId, params) {
      const existing = staffByAuth.get(authUserId);
      if (!existing) return null;
      const updated: StaffProfileRow = {
        ...existing,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
      };
      staffByAuth.set(authUserId, updated);
      return updated;
    },
  };
}
