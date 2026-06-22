import type {
  StoreProfile,
  StoreInviteCreated,
  StoreInvitesResponse,
  StoreStaffResponse,
  StoreGratitude,
  UpdateStoreProfileInput,
} from "@arigato/shared";
import {
  isApproved,
  generateInviteCode,
  summarizeGratitudeCounts,
  type StoreStatus,
} from "./store.model.js";
import type { StoreRepository, StoreRow } from "./store.repository.js";

/**
 * store feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（承認判定・招待コード生成・件数集計）と Repository（DB）を組み合わせて店のユースケースを実現する。
 * Repository は引数で受け取り（注入）、feature から infrastructure を直接 import しない。
 *
 * アクセス制御はこの層で守る。店スコープの全 API は、認証済みの authUserId が「その店の所有者」である
 * ことを確認してからデータを返す（他店のデータは取得・操作できない）。
 *
 * 最重要原則: 店向けの応答には金額（amount / customer_total / platform_fee）・残高・着金・payout を
 * 一切含めない。感謝の可視化は件数とお客さまの声（メッセージ）だけを返し、件数で並べ替え・順位付けしない。
 */

// お客さまの声フィードの表示上限（件数。金額とは無関係）
const GRATITUDE_VOICES_LIMIT = 30;

/**
 * 店が承認済みかを返すユースケース（Sprint 1 から残す薄いラッパ）。
 */
export function resolveApproval(status: StoreStatus): boolean {
  return isApproved(status);
}

// 店スコープのアクセス制御で起こりうるエラー（Route で HTTP ステータスに変換する）
// 店が存在しない／自分の所有でない場合に投げる。情報秘匿のため両方を区別なく 404 扱いにできる。
export class StoreNotFoundError extends Error {
  constructor() {
    super("store_not_found");
    this.name = "StoreNotFoundError";
  }
}
export class StoreForbiddenError extends Error {
  constructor() {
    super("store_forbidden");
    this.name = "StoreForbiddenError";
  }
}

// 店プロフィール行を API 応答（StoreProfile）へ変換する内部ヘルパ（金額・所有者は含めない）
function toStoreProfile(row: StoreRow): StoreProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    industry: row.industry,
    logoUrl: row.logoUrl,
    status: row.status,
    approvedAt: row.approvedAt,
  };
}

/**
 * 店スコープのガード（アクセス制御の中核）。
 * storeId の店を取得し、認証済みの authUserId が所有者であることを確認する。
 * - 店が無ければ StoreNotFoundError。
 * - 所有者が未紐付け（null）または別の auth ユーザーなら StoreForbiddenError（他店は触れない）。
 * 通過した場合だけ店行を返す。すべての店スコープ API はまずこれを通す。
 */
async function requireOwnedStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreRow> {
  const store = await repo.findStoreById(storeId);
  if (!store) {
    throw new StoreNotFoundError();
  }
  // 所有者が一致しない店は触れない（自店のデータのみ取得可）
  if (store.ownerAuthUserId !== authUserId) {
    throw new StoreForbiddenError();
  }
  return store;
}

/**
 * 自分（ログイン中の店アカウント）が所有する店を取得する（GET /store/me）。
 * 店ホーム・設定の起点。未紐付け（どの店も所有していない）なら null を返し、
 * フロントは導入承認（claim）導線へ誘導する。
 */
export async function getMyStore(
  repo: StoreRepository,
  authUserId: string,
): Promise<StoreProfile | null> {
  const store = await repo.findStoreByOwner(authUserId);
  if (!store) return null;
  return toStoreProfile(store);
}

/**
 * 店アカウントが未所有の店を引き受ける（導入のセットアップ・POST /store/:storeId/claim）。
 * 運営が用意した（pending の）店に、ログイン中の店アカウントを所有者として紐付ける。
 * これにより店アカウントの Supabase ユーザーと store が結びつき、以降は店スコープで操作できる。
 * - 店が無ければ StoreNotFoundError。
 * - 既に別の所有者がいる場合は StoreForbiddenError（横取りを防ぐ）。自分が所有者なら冪等に成功。
 */
export async function claimStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreProfile> {
  const store = await repo.findStoreById(storeId);
  if (!store) {
    throw new StoreNotFoundError();
  }
  // 既に所有者がいて自分でなければ拒否（他人の店は引き受けられない）
  if (store.ownerAuthUserId !== null && store.ownerAuthUserId !== authUserId) {
    throw new StoreForbiddenError();
  }
  // 自分が所有者なら据え置き（冪等）。未所有なら紐付ける
  if (store.ownerAuthUserId === authUserId) {
    return toStoreProfile(store);
  }
  const claimed = await repo.setStoreOwner(storeId, authUserId);
  if (!claimed) {
    // 紐付け直前に他者が所有した場合の競合
    throw new StoreForbiddenError();
  }
  return toStoreProfile(claimed);
}

/**
 * 店プロフィールを取得する（GET /store/:storeId）。店スコープ。
 * 自店のみ取得可。金額・残高は一切返さない。
 */
export async function getStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreProfile> {
  const store = await requireOwnedStore(repo, authUserId, storeId);
  return toStoreProfile(store);
}

/**
 * 導入を承認する（POST /store/:storeId/approve）。店スコープ。
 * 自店の status を pending→approved に遷移し、承認日時を設定する（既に approved なら冪等に据え置く）。
 */
export async function approveStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreProfile> {
  // 所有確認（自店のみ承認できる）
  await requireOwnedStore(repo, authUserId, storeId);
  const approved = await repo.approveStore(storeId);
  if (!approved) {
    throw new StoreNotFoundError();
  }
  return toStoreProfile(approved);
}

/**
 * 店プロフィールを更新する（PATCH /store/:storeId）。店スコープ。
 * 名前・紹介・業種・ロゴのみ更新する。ステータス・承認・金額は変更しない。
 */
export async function updateStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  input: UpdateStoreProfileInput,
): Promise<StoreProfile> {
  await requireOwnedStore(repo, authUserId, storeId);
  // 空文字の任意項目は未入力（null）に正規化して保存する
  const normalize = (v: string | undefined): string | null => {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  };
  const updated = await repo.updateStore(storeId, {
    name: input.name.trim(),
    description: normalize(input.description),
    industry: normalize(input.industry),
    logoUrl: input.logoUrl ?? null,
  });
  if (!updated) {
    throw new StoreNotFoundError();
  }
  return toStoreProfile(updated);
}

// 招待リンク URL を組み立てる関数の型（フロントのベース URL から作る・コンポジションルートで注入）
export type BuildInviteUrl = (code: string) => string;

/**
 * スタッフ招待を発行する（POST /store/:storeId/invites・方式A）。店スコープ。
 * 一意の招待コードを生成して保存し、店員さんに渡す招待リンク URL（/invite/:code）を返す。
 * この招待リンクから登録した店員さんは自動で自店に所属する（招待で店承認を担保）。
 */
export async function createStoreInvite(
  repo: StoreRepository,
  buildInviteUrl: BuildInviteUrl,
  authUserId: string,
  storeId: string,
): Promise<StoreInviteCreated> {
  await requireOwnedStore(repo, authUserId, storeId);
  // 一意の招待コードを生成する（Model の純粋関数）
  const code = generateInviteCode();
  const invite = await repo.createInvite(storeId, code);
  return {
    code: invite.code,
    inviteUrl: buildInviteUrl(invite.code),
    status: invite.status,
    createdAt: invite.createdAt,
  };
}

/**
 * 発行済み招待の一覧を取得する（GET /store/:storeId/invites）。店スコープ。
 * pending（招待中）/ accepted（所属確定）/ revoked（失効）を新しい順に返す。
 */
export async function listStoreInvites(
  repo: StoreRepository,
  buildInviteUrl: BuildInviteUrl,
  authUserId: string,
  storeId: string,
): Promise<StoreInvitesResponse> {
  await requireOwnedStore(repo, authUserId, storeId);
  const invites = await repo.listInvites(storeId);
  return {
    items: invites.map((i) => ({
      code: i.code,
      status: i.status,
      createdAt: i.createdAt,
      inviteUrl: buildInviteUrl(i.code),
      acceptedStaffName: i.acceptedStaffName,
      acceptedAt: i.acceptedAt,
    })),
    // 招待中（pending）の件数
    pendingCount: invites.filter((i) => i.status === "pending").length,
  };
}

/**
 * 所属スタッフ一覧を取得する（GET /store/:storeId/staff）。店スコープ。
 * 在籍管理用。名簿順（在籍が古い順）の中立な並びで返す。
 * 金額・受取件数は含めない（QR 発行は店員さん本人が主体のため店側は発行しない）。
 */
export async function listStoreStaff(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreStaffResponse> {
  await requireOwnedStore(repo, authUserId, storeId);
  const staff = await repo.listStaff(storeId);
  return {
    items: staff.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      headline: s.headline,
      avatarUrl: s.avatarUrl,
    })),
    count: staff.length,
  };
}

/**
 * 感謝の可視化を取得する（GET /store/:storeId/gratitude）。店スコープ。
 *
 * 店全体の「ありがとう」件数（累計・今日・今週・今月）と、お客さまの声フィード（メッセージ・いつ・誰宛か）、
 * スタッフ別の件数を返す。
 *
 * 金額（amount / customer_total / platform_fee）・残高・着金は一切返さない（店はお金に触れない）。
 * 件数集計は Model の純粋関数に委ね、スタッフ別件数は名簿順（中立）のまま——件数で並べ替え・順位付けしない。
 */
export async function getStoreGratitude(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  now: Date,
): Promise<StoreGratitude> {
  await requireOwnedStore(repo, authUserId, storeId);

  // 件数集計（受取日時だけを取得し、Model で累計/今日/今週/今月を算出する。金額は扱わない）
  const times = await repo.listGratitudeTimes(storeId);
  const counts = summarizeGratitudeCounts(times, now);

  // お客さまの声（メッセージのある成立済みを新しい順に。金額なし）
  const voices = await repo.listGratitudeVoices(storeId, GRATITUDE_VOICES_LIMIT);

  // スタッフ別件数（名簿順・中立。件数で並べ替えない）
  const perStaff = await repo.listGratitudePerStaff(storeId);

  return {
    totalCount: counts.totalCount,
    todayCount: counts.todayCount,
    weekCount: counts.weekCount,
    monthCount: counts.monthCount,
    voices: voices.map((v) => ({
      id: v.id,
      message: v.message,
      receivedAt: v.receivedAt,
      staffName: v.staffName,
    })),
    perStaff: perStaff.map((p) => ({
      staffId: p.staffId,
      staffName: p.staffName,
      count: p.count,
    })),
  };
}
