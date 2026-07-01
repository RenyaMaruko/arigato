import { randomUUID } from "node:crypto";
import type {
  StaffRepository,
  InviteRow,
  StaffProfileRow,
  StaffMembershipRow,
  StaffReceiptStoreRow,
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
  // 所属（membership）の簡易ストア（membershipId をキー）。staff(人)＝authUserId と店を結ぶ。
  // leftAt は論理削除（脱退・在籍解除）の時刻。null＝在籍中（active）、値あり＝脱退済み。
  const memberships = new Map<
    string,
    {
      authUserId: string;
      storeId: string;
      storeName: string;
      createdAt: number;
      leftAt: number | null;
    }
  >();
  // Connect 連携状態（authUserId をキー）。Stripe Account ID と identity_status を持つ
  const connectByAuth = new Map<
    string,
    { stripeAccountId: string | null; identityStatus: IdentityStatus }
  >();
  // 店の管理者（store_admin 相当）。キー `${storeId}::${authUserId}`。leftAt は論理削除（null＝active）。
  // 管理者招待の受け入れ（acceptAdminInvite）とモード切替の判定（hasManagedStore）に使う。
  const storeAdmins = new Map<
    string,
    { storeId: string; authUserId: string; role: "owner" | "admin"; leftAt: number | null }
  >();
  const adminKey = (storeId: string, authUserId: string) => `${storeId}::${authUserId}`;

  // 開発用シード招待（任意）。導入承認に同意済みの店の pending 招待を1件用意する
  const seedCode = process.env.SEED_INVITE_CODE;
  if (seedCode) {
    invites.set(seedCode, {
      code: seedCode,
      storeId: randomUUID(),
      storeName: process.env.SEED_STORE_NAME ?? "テスト店",
      inviteStatus: "pending",
      // 開発シードはスタッフ招待（在籍・QR）
      inviteType: "staff",
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
      // 在籍中（leftAt === null）のみ返す（脱退店は QR・所属一覧から消える）
      const list = [...memberships.entries()]
        .filter(([, m]) => m.authUserId === authUserId && m.leftAt === null)
        .sort((a, b) => a[1].createdAt - b[1].createdAt);
      return list.map<StaffMembershipRow>(([id, m]) => ({
        membershipId: id,
        storeId: m.storeId,
        storeName: m.storeName,
        // メモリ実装ではロゴは持たない
        logoUrl: null,
      }));
    },

    // 受取履歴の店フィルタ用の店一覧（在籍中＋脱退済み）。
    // インメモリは tip を保持しないが、membership（脱退済み含む）から店を distinct で返す
    // （実 DB は tip.store_id を基点にするが、メモリでは membership を擬似的な素材にする）。
    async listReceiptStoresByAuthUserId(authUserId) {
      const seen = new Set<string>();
      const result: StaffReceiptStoreRow[] = [];
      for (const m of memberships.values()) {
        if (m.authUserId !== authUserId) continue;
        if (seen.has(m.storeId)) continue;
        seen.add(m.storeId);
        result.push({ storeId: m.storeId, storeName: m.storeName });
      }
      // 店名昇順（実 DB と並びを揃える）
      result.sort((a, b) => a.storeName.localeCompare(b.storeName));
      return result;
    },

    // 店員さんが自分でその店を脱退する（論理削除）。本人かつ在籍中の membership のみ leftAt を立てる。
    async leaveMembership(authUserId, membershipId) {
      const m = memberships.get(membershipId);
      // 他人の所属・既に脱退済み・存在しないは 0 件（スコープ検証）
      if (!m || m.authUserId !== authUserId || m.leftAt !== null) {
        return 0;
      }
      memberships.set(membershipId, { ...m, leftAt: Date.now() });
      return 1;
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
      // 同じ (staff,store) の既存 membership（在籍/脱退を問わず）を引く（UNIQUE 制約のため最大1件）
      const existing = [...memberships.entries()].find(
        ([, m]) => m.authUserId === authUserId && m.storeId === invite.storeId,
      );
      // 在籍中（leftAt === null）→ already_member（招待は消費せず・多重参加不可）
      if (existing && existing[1].leftAt === null) {
        return {
          outcome: "already_member" as const,
          membershipId: existing[0],
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      }
      // 脱退済み（leftAt に値あり）→ 再有効化（leftAt を null に戻す・同じ membershipId が復活）
      if (existing && existing[1].leftAt !== null) {
        memberships.set(existing[0], { ...existing[1], leftAt: null });
        invites.set(code, { ...invite, inviteStatus: "accepted" });
        return {
          outcome: "rejoined" as const,
          membershipId: existing[0],
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      }
      // 存在しなければ新規所属を作成し、招待を消費する
      const membershipId = randomUUID();
      memberships.set(membershipId, {
        authUserId,
        storeId: invite.storeId,
        storeName: invite.storeName,
        createdAt: Date.now(),
        leftAt: null,
      });
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      return {
        outcome: "joined" as const,
        membershipId,
        storeId: invite.storeId,
        storeName: invite.storeName,
      };
    },

    // 管理者招待（type='admin'）を受け入れて store_admin role=admin を作る/再有効化する
    async acceptAdminInvite(authUserId, code) {
      const invite = invites.get(code);
      // pending かつ type='admin' かつ店承認済みのときだけ使える
      if (
        !invite ||
        invite.inviteStatus !== "pending" ||
        invite.inviteType !== "admin" ||
        !invite.storeAdopted
      ) {
        throw new Error("invite_not_usable");
      }
      if (!profileByAuth.get(authUserId)) {
        throw new Error("staff_not_found");
      }
      const key = adminKey(invite.storeId, authUserId);
      const existing = storeAdmins.get(key);
      // 既に active な管理者（owner/admin）→ already_member（二重付与しない・招待は消費しない）
      if (existing && existing.leftAt === null) {
        return {
          outcome: "already_member" as const,
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      }
      // 脱退済み → 再有効化（role='admin'）＋招待を消費
      if (existing && existing.leftAt !== null) {
        storeAdmins.set(key, { ...existing, role: "admin", leftAt: null });
        invites.set(code, { ...invite, inviteStatus: "accepted" });
        return {
          outcome: "rejoined" as const,
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      }
      // 無ければ新規に管理者(admin)を作る＋招待を消費
      storeAdmins.set(key, {
        storeId: invite.storeId,
        authUserId,
        role: "admin",
        leftAt: null,
      });
      invites.set(code, { ...invite, inviteStatus: "accepted" });
      return {
        outcome: "joined" as const,
        storeId: invite.storeId,
        storeName: invite.storeName,
      };
    },

    // 自分が active な管理者である店が1つ以上あるか（モード切替の判定）。
    // メモリ実装は店の閉店を追わないため active な store_admin の有無だけで判定する。
    async hasManagedStore(authUserId) {
      for (const a of storeAdmins.values()) {
        if (a.authUserId === authUserId && a.leftAt === null) return true;
      }
      return false;
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

    // 本人のアバター画像URL（公開URL）を更新する（画像アップロード後）
    async setAvatarUrl(authUserId, avatarUrl) {
      const existing = profileByAuth.get(authUserId);
      if (!existing) return;
      profileByAuth.set(authUserId, { ...existing, avatarUrl });
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

    // 送金（payout）の本人・Connect 連携状態を返す（送金可否判定・Stripe payout の実行先）
    async findPayoutContext(authUserId) {
      const profile = profileByAuth.get(authUserId);
      if (!profile) return null;
      const connect = connectByAuth.get(authUserId) ?? {
        stripeAccountId: null,
        identityStatus: profile.identityStatus,
      };
      return {
        staffId: profile.id,
        stripeAccountId: connect.stripeAccountId,
        identityStatus: connect.identityStatus,
      };
    },

    // インメモリ実装は tip を保持しないため着金可能な tip は空（実 DB 環境で本実装が動く）
    async listPayableTipsByAuthUserId() {
      return [];
    },

    // インメモリ実装は payout を永続化しないため、記録は擬似的に返すのみ（実 DB 環境で本実装が動く）
    async createPendingPayoutAndMarkTipsPaid(params) {
      return { id: randomUUID(), amount: params.amount, status: "pending" as const };
    },

    // 同上。永続化しないため stripe_payout_id 補完は no-op（実 DB 環境で本実装が動く）
    async attachStripePayoutId() {
      // no-op
    },

    // 同上。永続化しないため revert は no-op（実 DB 環境で本実装が動く）
    async revertPayoutByPayoutId() {
      // no-op
    },

    // 同上。送金履歴も空
    async listPayoutsByAuthUserId() {
      return [];
    },

    // 同上。payout を保持しないため照合できず、反映なし（false）
    async markPayoutPaid() {
      return false;
    },
    async markPayoutFailedAndRevertTips() {
      return false;
    },

    // インメモリ実装は tip を保持しないため受取履歴は空（実 DB 環境で本実装が動く）
    async listTipsPageByAuthUserId() {
      return [];
    },

    // 同上。tip を保持しないため全件集計は 0（実 DB 環境で本実装が動く）
    async getStaffTipsTotalsByAuthUserId() {
      return { totalCount: 0, totalAmount: 0 };
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

    // (d) payout を保持しないインメモリでは照合できず null（実 DB 環境で本実装が動く）
    async findPayoutForLedger() {
      return null;
    },
    // (d) tip を保持しないインメモリでは紐づく tip 無し（実 DB 環境で本実装が動く）
    async listPaidTipsForPayout() {
      return [];
    },
    // (d) tip を保持しないインメモリでは charge→tip 逆引きできず null
    async findTipIdByChargeId() {
      return null;
    },
    // (d) 台帳を保持しないインメモリでは追記なし（0 件）
    async appendPayoutLedgerEntries() {
      return 0;
    },
    // (f) 台帳を保持しないインメモリでは補正追記はダミー id を返す（実 DB 環境で本実装が動く）
    async appendLedgerCorrection() {
      return "00000000-0000-0000-0000-000000000000";
    },
    // (e) tip / Connected Account を保持しないインメモリでは照合対象なし（実 DB 環境で本実装が動く）
    async listReconcileTotalsByStaff() {
      return [];
    },
  };
}
