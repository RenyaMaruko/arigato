import { randomUUID } from "node:crypto";
import type {
  StaffRepository,
  InviteRow,
  StaffProfileRow,
  StaffMembershipRow,
  StaffConnectRow,
} from "./staff.repository.js";
import type { IdentityStatus } from "./staff.model.js";

/**
 * staff feature の Repository インメモリ実装。
 * DATABASE_URL が無い環境（ローカル疎通・一部テスト）でも Service を動かせるようにする。
 * 実 DB 実装（createStaffRepository）と同じ契約（StaffRepository）を満たす差し替え。
 *
 * 多対多モデル: staff（人）はプロフィールを1つ持ち、所属（membership）を複数持てる。
 *
 * 招待・店の初期データは環境変数 SEED_INVITE_CODE / SEED_STORE_NAME から最小限を投入できる
 * （未設定なら空。実運用は実 DB を使う）。
 */
export function createInMemoryStaffRepository(): StaffRepository {
  // 招待の簡易ストア（code をキー）
  const invites = new Map<string, InviteRow>();
  // staff プロフィールの簡易ストア（authUserId をキー）
  const profileByAuth = new Map<string, StaffProfileRow>();
  // 所属（membership）の簡易ストア（membershipId をキー）。staff(人)＝authUserId と店を結ぶ
  const memberships = new Map<
    string,
    { authUserId: string; storeId: string; storeName: string; createdAt: number }
  >();
  // Connect 連携状態（authUserId をキー）。Stripe Account ID と identity_status を持つ
  const connectByAuth = new Map<
    string,
    { stripeAccountId: string | null; identityStatus: IdentityStatus }
  >();

  // 開発用シード招待（任意）。導入承認に同意済みの店の pending 招待を1件用意する
  const seedCode = process.env.SEED_INVITE_CODE;
  if (seedCode) {
    invites.set(seedCode, {
      code: seedCode,
      storeId: randomUUID(),
      storeName: process.env.SEED_STORE_NAME ?? "テスト店",
      inviteStatus: "pending",
      storeAdopted: true,
    });
  }

  return {
    async findInviteByCode(code) {
      return invites.get(code) ?? null;
    },

    async findStaffByAuthUserId(authUserId) {
      return profileByAuth.get(authUserId) ?? null;
    },

    async listMembershipsByAuthUserId(authUserId) {
      const list = [...memberships.entries()]
        .filter(([, m]) => m.authUserId === authUserId)
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      return list.map<StaffMembershipRow>(([id, m]) => ({
        membershipId: id,
        storeId: m.storeId,
        storeName: m.storeName,
      }));
    },

    async createStaffProfile(params) {
      const id = randomUUID();
      const row: StaffProfileRow = {
        id,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
        identityStatus: "none",
      };
      profileByAuth.set(params.authUserId, row);
      // Connect 連携状態は初期値（未連携・identity_status=none）で持つ
      connectByAuth.set(params.authUserId, { stripeAccountId: null, identityStatus: "none" });
      return row;
    },

    async joinStoreByInvite(authUserId, code) {
      const invite = invites.get(code);
      // 招待が pending かつ店承認済みでなければ使えない
      if (!invite || invite.inviteStatus !== "pending" || !invite.storeAdopted) {
        throw new Error("invite_not_usable");
      }
      const profile = profileByAuth.get(authUserId);
      if (!profile) {
        throw new Error("staff_not_found");
      }
      // 既に同じ店に所属していないか（多重参加不可）
      const existing = [...memberships.entries()].find(
        ([, m]) => m.authUserId === authUserId && m.storeId === invite.storeId,
      );
      if (existing) {
        return {
          outcome: "already_member" as const,
          membershipId: existing[0],
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      }
      // 新規所属を作成し、招待を消費する
      const membershipId = randomUUID();
      memberships.set(membershipId, {
        authUserId,
        storeId: invite.storeId,
        storeName: invite.storeName,
        createdAt: Date.now(),
      });
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      return {
        outcome: "joined" as const,
        membershipId,
        storeId: invite.storeId,
        storeName: invite.storeName,
      };
    },

    async updateStaffProfile(authUserId, params) {
      const existing = profileByAuth.get(authUserId);
      if (!existing) return null;
      const updated: StaffProfileRow = {
        ...existing,
        displayName: params.displayName,
        headline: params.headline,
        avatarUrl: params.avatarUrl,
      };
      profileByAuth.set(authUserId, updated);
      return updated;
    },

    // 本人の Connect 連携状態を返す（オンボーディングの起点）
    async findStaffConnect(authUserId) {
      const profile = profileByAuth.get(authUserId);
      if (!profile) return null;
      const connect = connectByAuth.get(authUserId) ?? {
        stripeAccountId: null,
        identityStatus: profile.identityStatus,
      };
      const row: StaffConnectRow = {
        id: profile.id,
        displayName: profile.displayName,
        stripeAccountId: connect.stripeAccountId,
        identityStatus: connect.identityStatus,
      };
      return row;
    },

    // 新規作成した Connected Account を保存する
    async setStripeAccountId(authUserId, stripeAccountId) {
      const existing = connectByAuth.get(authUserId) ?? {
        stripeAccountId: null,
        identityStatus: "none" as IdentityStatus,
      };
      connectByAuth.set(authUserId, { ...existing, stripeAccountId });
    },

    // インメモリ実装は tip を保持しないため受取履歴は空（実 DB 環境で本実装が動く）
    async listTipsByAuthUserId() {
      return [];
    },

    // 同上。保留残高集計の元になる成立済み tip も空
    async listSettlementsByAuthUserId() {
      return [];
    },

    // 同上。申告データの受取記録も空
    async listTaxRecordsByAuthUserId() {
      return [];
    },

    // account.updated を反映する。Connect ストアから対象を引き、payouts_enabled=true なら verified へ。
    // 既に verified なら二重遷移しない。tip を持たないため promotedTips は 0。
    async applyAccountUpdate(stripeAccountId, payoutsEnabled) {
      // Stripe Account ID で本人を逆引きする
      let foundAuth: string | null = null;
      for (const [authUserId, connect] of connectByAuth) {
        if (connect.stripeAccountId === stripeAccountId) {
          foundAuth = authUserId;
          break;
        }
      }
      if (!foundAuth) return { found: false, verified: false, promotedTips: 0 };

      const connect = connectByAuth.get(foundAuth)!;
      if (!payoutsEnabled) {
        return { found: true, verified: connect.identityStatus === "verified", promotedTips: 0 };
      }
      if (connect.identityStatus === "verified") {
        return { found: true, verified: true, promotedTips: 0 };
      }
      // verified へ確定し、プロフィールの identity_status も同期する
      connectByAuth.set(foundAuth, { ...connect, identityStatus: "verified" });
      const profile = profileByAuth.get(foundAuth);
      if (profile) profileByAuth.set(foundAuth, { ...profile, identityStatus: "verified" });
      return { found: true, verified: true, promotedTips: 0 };
    },
  };
}
