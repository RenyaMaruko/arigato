import type {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
  StaffMe,
  InviteInfo,
} from "@arigato/shared";
import {
  canPayout,
  isInviteUsable,
  buildTipUrl,
  normalizeHeadline,
  type IdentityStatus,
} from "./staff.model.js";
import type { StaffRepository, StaffProfileRow } from "./staff.repository.js";

/**
 * staff feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（招待判定・URL組み立て）と Repository（DB）を組み合わせて店員さんのユースケースを実現する。
 * Repository は引数で受け取り（注入）、feature から infrastructure を直接 import しない。
 *
 * アクセス制御はこの層で守る。`/staff/me` 系は必ず認証済みの authUserId をキーに本人の行だけを扱い、
 * 他人のデータが返らないようにする（横断ルール: 自分のスコープのみ）。
 */

// QR用URL の組み立てに使うフロントのベース URL を Service に注入する関数の型
export type BuildTipUrl = (staffId: string) => string;

/**
 * 本人確認の状態から着金可能かを返すユースケース（Sprint 1 から残す薄いラッパ）。
 */
export function resolvePayoutAvailability(status: IdentityStatus): boolean {
  return canPayout(status);
}

// プロフィール行を API 応答（StaffMe）へ変換する内部ヘルパ
function toStaffMe(row: StaffProfileRow, buildUrl: BuildTipUrl): StaffMe {
  return {
    id: row.id,
    displayName: row.displayName,
    headline: row.headline,
    avatarUrl: row.avatarUrl,
    storeId: row.storeId,
    storeName: row.storeName,
    identityStatus: row.identityStatus,
    // QR が指す固定 URL（/tip/:staffId）
    tipUrl: buildUrl(row.id),
  };
}

/**
 * 招待コードを検証する（GET /invites/:code・認証不要）。
 * 店員さんのアカウント作成画面で所属先を表示するために使う。
 * 招待が無ければ null。あれば店情報と「今すぐ使えるか（valid）」を返す。
 */
export async function getInviteInfo(
  repo: StaffRepository,
  code: string,
): Promise<InviteInfo | null> {
  const invite = await repo.findInviteByCode(code);
  if (!invite) return null;

  // 招待が未消費かつ店が承認済みのときのみ valid（業務ルールは Model の純粋関数で判定）
  const valid = isInviteUsable(invite.inviteStatus, invite.storeStatus);
  return {
    code: invite.code,
    storeId: invite.storeId,
    storeName: invite.storeName,
    valid,
  };
}

/**
 * 自分のプロフィールを取得する（GET /staff/me・本人スコープ）。
 * 認証済みの authUserId をキーに本人の staff 行のみを返す（他人のデータは取得できない）。
 * 未作成（初回ログイン）なら null を返し、フロントはプロフィール作成へ誘導する。
 */
export async function getStaffMe(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
): Promise<StaffMe | null> {
  const row = await repo.findStaffByAuthUserId(authUserId);
  if (!row) return null;
  return toStaffMe(row, buildUrl);
}

// プロフィール作成で起こりうる業務エラー（Route で HTTP ステータスに変換する）
export class InviteNotUsableError extends Error {
  constructor() {
    super("invite_not_usable");
    this.name = "InviteNotUsableError";
  }
}
export class StaffAlreadyExistsError extends Error {
  constructor() {
    super("staff_already_exists");
    this.name = "StaffAlreadyExistsError";
  }
}

/**
 * 初回プロフィールを作成する（POST /staff/me・本人スコープ）。
 * 招待コードで store_id を確定し、本人確認・口座登録・Stripe Connect 連携なしで成立させる
 * （identity_status は DB 既定の none のまま）。
 *
 * - 既に自分の staff があれば多重作成を防ぐ（StaffAlreadyExistsError）。
 * - 招待が無効（消費済み・失効・店未承認）なら InviteNotUsableError。
 */
export async function createStaffProfile(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
  input: CreateStaffProfileInput,
): Promise<StaffMe> {
  // 多重作成の防止（同じ auth ユーザーは1つの staff のみ）
  const existing = await repo.findStaffByAuthUserId(authUserId);
  if (existing) {
    throw new StaffAlreadyExistsError();
  }

  // 招待を検証（未消費かつ店承認済みのときのみ所属確定に使える）
  const invite = await repo.findInviteByCode(input.inviteCode);
  if (!invite || !isInviteUsable(invite.inviteStatus, invite.storeStatus)) {
    throw new InviteNotUsableError();
  }

  // 招待を消費しつつ staff を作成（原子的に。二重消費は Repository 内で弾く）
  try {
    const row = await repo.createStaffWithInvite(invite.code, {
      authUserId,
      storeId: invite.storeId,
      displayName: input.displayName,
      headline: normalizeHeadline(input.headline),
      avatarUrl: input.avatarUrl ?? null,
    });
    return toStaffMe(row, buildUrl);
  } catch (err) {
    // 検証後に他リクエストが招待を先に消費していた場合の競合
    if (err instanceof Error && err.message === "invite_not_usable") {
      throw new InviteNotUsableError();
    }
    throw err;
  }
}

/**
 * 自分のプロフィールを編集する（PATCH /staff/me・本人スコープ）。
 * 所属・招待は変更せず、display_name・headline・avatar のみ更新する。
 * 自分の staff が無ければ null（作成前のため編集できない）。
 */
export async function updateStaffProfile(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
  input: UpdateStaffProfileInput,
): Promise<StaffMe | null> {
  const row = await repo.updateStaffProfile(authUserId, {
    displayName: input.displayName,
    headline: normalizeHeadline(input.headline),
    avatarUrl: input.avatarUrl ?? null,
  });
  if (!row) return null;
  return toStaffMe(row, buildUrl);
}
