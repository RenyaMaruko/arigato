import type {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
  StaffMe,
  InviteInfo,
  JoinStoreResult,
  StaffTipsResponse,
  StaffBalance,
  ConnectOnboardResponse,
} from "@arigato/shared";
import {
  canPayout,
  isInviteUsable,
  buildTipUrl,
  normalizeHeadline,
  summarizeBalance,
  buildTaxReportCsv,
  calculateStaffTakeAmount,
  type IdentityStatus,
} from "./staff.model.js";
import type {
  StaffRepository,
  StaffProfileRow,
  StaffMembershipRow,
  ApplyAccountUpdateResult,
} from "./staff.repository.js";
import type { CreateOnboardingLinkResult } from "../../infrastructure/stripe/stripe.types.js";

/**
 * staff feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（招待判定・URL組み立て）と Repository（DB）を組み合わせて店員さんのユースケースを実現する。
 * Repository は引数で受け取り（注入）、feature から infrastructure を直接 import しない。
 *
 * 多対多モデル: staff（人）はプロフィールを1つ持ち、所属（membership）を複数持てる（掛け持ち）。
 * QR は membership 単位（/tip/:membershipId）。参加の確定点は join（招待コードで所属追加）に集約する。
 *
 * アクセス制御はこの層で守る。`/staff/me` 系は必ず認証済みの authUserId をキーに本人の行だけを扱い、
 * 他人のデータが返らないようにする（横断ルール: 自分のスコープのみ）。
 */

// QR用URL の組み立てに使うフロントのベース URL を Service に注入する関数の型（membership 単位）
export type BuildTipUrl = (membershipId: string) => string;

/**
 * 本人確認の状態から着金可能かを返すユースケース（Sprint 1 から残す薄いラッパ）。
 */
export function resolvePayoutAvailability(status: IdentityStatus): boolean {
  return canPayout(status);
}

// プロフィール行＋所属一覧を API 応答（StaffMe）へ変換する内部ヘルパ
function toStaffMe(
  profile: StaffProfileRow,
  memberships: StaffMembershipRow[],
  buildUrl: BuildTipUrl,
): StaffMe {
  return {
    id: profile.id,
    displayName: profile.displayName,
    headline: profile.headline,
    avatarUrl: profile.avatarUrl,
    identityStatus: profile.identityStatus,
    // 所属店一覧（各 membership ごとに店ごとQR用URL を組み立てる）
    memberships: memberships.map((m) => ({
      membershipId: m.membershipId,
      storeId: m.storeId,
      storeName: m.storeName,
      // QR が指す固定 URL（/tip/:membershipId）
      tipUrl: buildUrl(m.membershipId),
    })),
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

  // 招待が未消費かつ店が導入承認に同意済みのときのみ valid（業務ルールは Model の純粋関数で判定）
  const valid = isInviteUsable(invite.inviteStatus, invite.storeAdopted);
  return {
    code: invite.code,
    storeId: invite.storeId,
    storeName: invite.storeName,
    valid,
  };
}

/**
 * 自分のプロフィールを取得する（GET /staff/me・本人スコープ）。
 * 認証済みの authUserId をキーに本人の staff 行＋所属一覧（店ごとQR用URL）を返す。
 * 未作成（初回ログイン）なら null を返し、フロントはプロフィール作成へ誘導する。
 */
export async function getStaffMe(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
): Promise<StaffMe | null> {
  const profile = await repo.findStaffByAuthUserId(authUserId);
  if (!profile) return null;
  const memberships = await repo.listMembershipsByAuthUserId(authUserId);
  return toStaffMe(profile, memberships, buildUrl);
}

// プロフィール作成・参加で起こりうる業務エラー（Route で HTTP ステータスに変換する）
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
// 参加（join）時にプロフィールが未作成だった（先に POST /staff/me が必要）
export class StaffNotFoundError extends Error {
  constructor() {
    super("staff_not_found");
    this.name = "StaffNotFoundError";
  }
}

/**
 * 初回プロフィールを作成する（POST /staff/me・本人スコープ）。
 * プロフィール（表示名・一言・写真）を人ごとに1つ作る。所属の確定はここでは行わない
 * （参加は POST /staff/me/join に集約する）。本人確認・口座登録・Connect 連携は一切求めない。
 *
 * - 既に自分の staff があれば多重作成を防ぐ（StaffAlreadyExistsError）。
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

  // プロフィールを作成（所属はまだ無い）
  const profile = await repo.createStaffProfile({
    authUserId,
    displayName: input.displayName,
    headline: normalizeHeadline(input.headline),
    avatarUrl: input.avatarUrl ?? null,
  });
  // 作成直後は所属なし。所属一覧は空配列で返す（後続の join で追加される）
  return toStaffMe(profile, [], buildUrl);
}

/**
 * 招待コードで所属（staff_store）を追加する（POST /staff/me/join・本人スコープ）。
 * 新規/既存問わず「参加の確定点」。
 * - プロフィール未作成なら StaffNotFoundError（先に POST /staff/me が必要）。
 * - 招待が無効（消費済み・失効・店未承認）なら InviteNotUsableError。
 * - 既に同店所属なら already_member を返す（招待は消費せず・多重参加不可）。
 * - 新規なら membership を作り joined を返す。
 */
export async function joinStore(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
  inviteCode: string,
): Promise<JoinStoreResult> {
  // 本人のプロフィールが必要（先に作成済みのはず）
  const profile = await repo.findStaffByAuthUserId(authUserId);
  if (!profile) {
    throw new StaffNotFoundError();
  }

  // 招待を検証（未消費かつ店承認済みのときのみ使える）。事前検証でユーザーに早く弾く
  const invite = await repo.findInviteByCode(inviteCode);
  if (!invite || !isInviteUsable(invite.inviteStatus, invite.storeAdopted)) {
    throw new InviteNotUsableError();
  }

  // 所属を追加（既存なら already_member）。二重消費・一意制約は Repository のトランザクションで担保
  try {
    const result = await repo.joinStoreByInvite(authUserId, inviteCode);
    return {
      status: result.outcome,
      membershipId: result.membershipId,
      storeId: result.storeId,
      storeName: result.storeName,
      tipUrl: buildUrl(result.membershipId),
    };
  } catch (err) {
    if (err instanceof Error && err.message === "invite_not_usable") {
      throw new InviteNotUsableError();
    }
    if (err instanceof Error && err.message === "staff_not_found") {
      throw new StaffNotFoundError();
    }
    throw err;
  }
}

/**
 * 自分のプロフィールを編集する（PATCH /staff/me・本人スコープ）。
 * 所属は変更せず、display_name・headline・avatar のみ更新する。
 * 自分の staff が無ければ null（作成前のため編集できない）。
 */
export async function updateStaffProfile(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  authUserId: string,
  input: UpdateStaffProfileInput,
): Promise<StaffMe | null> {
  const profile = await repo.updateStaffProfile(authUserId, {
    displayName: input.displayName,
    headline: normalizeHeadline(input.headline),
    avatarUrl: input.avatarUrl ?? null,
  });
  if (!profile) return null;
  // 更新後の所属一覧も併せて返す（ホーム再描画に使える）
  const memberships = await repo.listMembershipsByAuthUserId(authUserId);
  return toStaffMe(profile, memberships, buildUrl);
}

/**
 * 受取履歴を取得する（GET /staff/me/tips・本人スコープ）。
 * 認証済みの authUserId をキーに本人の成立済み投げ銭だけを新しい順に返す。
 * 金額・メッセージを含むのは本人スコープのこの経路だけ（横断ルール: 金額は本人のみ）。
 * 店ラベル（storeName）付き。プロフィール未作成なら null。
 */
export async function getStaffTips(
  repo: StaffRepository,
  authUserId: string,
): Promise<StaffTipsResponse | null> {
  // 本人が存在するか（未作成なら履歴も無い）
  const me = await repo.findStaffByAuthUserId(authUserId);
  if (!me) return null;

  // 本人の受取履歴を取得（Repository が auth_user_id で本人に限定する）
  const rows = await repo.listTipsByAuthUserId(authUserId);
  // 手取り型: DB の amount は額面のため、店員さんに見せる金額は手取り（約85%）へ変換する。
  // 1件ごとに手取りへ変換し、合計も変換後の金額で合算する（行表示と合計の整合）。
  const items = rows.map((t) => ({
    id: t.id,
    // 額面 → 店員手取り（約85%）
    amount: calculateStaffTakeAmount(t.amount),
    message: t.message,
    receivedAt: t.receivedAt,
    storeName: t.storeName,
    settlementStatus: t.settlementStatus,
  }));
  // 受取総額（手取りベース・本人のみに見せる）
  const totalAmount = items.reduce((sum, t) => sum + t.amount, 0);
  return {
    items,
    totalAmount,
  };
}

/**
 * 保留残高サマリを取得する（GET /staff/me/balance・本人スコープ）。
 * 本人の成立済み投げ銭から held 合計（保留残高）・payable 合計（着金可能額）・paid 合計を集計する。
 * 残高・本人確認は人ごとに集約する（全所属店をまとめる）。金額を返すのは本人スコープのこの経路だけ。
 * プロフィール未作成なら null。
 */
export async function getStaffBalance(
  repo: StaffRepository,
  authUserId: string,
): Promise<StaffBalance | null> {
  const me = await repo.findStaffByAuthUserId(authUserId);
  if (!me) return null;

  // 成立済み tip の settlement 状態と金額を取得し、Model で合算する
  const settlements = await repo.listSettlementsByAuthUserId(authUserId);
  const summary = summarizeBalance(settlements);
  return {
    heldAmount: summary.heldAmount,
    payableAmount: summary.payableAmount,
    paidAmount: summary.paidAmount,
    // 本人確認の状態から着金可否を判定（Model の純粋関数）
    canPayout: canPayout(me.identityStatus),
    identityStatus: me.identityStatus,
  };
}

/**
 * 申告データ CSV を生成する（GET /staff/me/tax-report・本人スコープ）。
 * 本人の成立済み受取記録を年で絞り、「受取日 / 金額 / 店名」を含む CSV 文字列を返す。
 * プロフィール未作成なら null。
 */
export async function getStaffTaxReport(
  repo: StaffRepository,
  authUserId: string,
  year: number,
): Promise<string | null> {
  const me = await repo.findStaffByAuthUserId(authUserId);
  if (!me) return null;

  // 本人の受取記録を取得し、Model で CSV へ整形する
  const records = await repo.listTaxRecordsByAuthUserId(authUserId, year);
  return buildTaxReportCsv(records);
}

// Connect オンボーディングリンクを発行する infrastructure 関数の型（コンポジションルートで注入）
export type CreateOnboardingLink = (params: {
  connectedAccountId: string | null;
  staffDisplayName: string;
  returnUrl: string;
  refreshUrl: string;
}) => Promise<CreateOnboardingLinkResult>;

// オンボーディングの戻り先 URL を組み立てる関数の型（フロントのベース URL から作る）
export type BuildOnboardingUrls = () => { returnUrl: string; refreshUrl: string };

/**
 * Stripe Connect オンボーディングを開始する（POST /staff/me/connect/onboard・本人スコープ）。
 * 本人の Connected Account（無ければ作成）に対してオンボーディングリンクを発行し、URL を返す。
 * 新規作成した Connected Account は本人の staff に保存する（人ごと1回）。
 * 完了の判定はこのリンクの戻りではなく account.updated Webhook を正とする。
 * プロフィール未作成なら null。
 */
export async function startConnectOnboarding(
  repo: StaffRepository,
  createLink: CreateOnboardingLink,
  buildUrls: BuildOnboardingUrls,
  authUserId: string,
): Promise<ConnectOnboardResponse | null> {
  // 本人の Connect 連携状態を取得（未作成なら null）
  const connect = await repo.findStaffConnect(authUserId);
  if (!connect) return null;

  const { returnUrl, refreshUrl } = buildUrls();
  // オンボーディングリンクを発行（Connected Account が無ければ infrastructure 側で作成される）
  const result = await createLink({
    connectedAccountId: connect.stripeAccountId,
    staffDisplayName: connect.displayName,
    returnUrl,
    refreshUrl,
  });

  // 新規作成した Connected Account は本人の staff に保存する（次回以降は再利用する）
  if (!connect.stripeAccountId) {
    await repo.setStripeAccountId(authUserId, result.connectedAccountId);
  }

  return { onboardingUrl: result.onboardingUrl };
}

/**
 * account.updated（Connected Account の状態変化）を反映する（Webhook 経由・本人確認の遷移）。
 * Connected Account ID で本人を引き、payouts_enabled=true なら identity_status を verified に確定し、
 * held の tip を payable へ遷移する。二重遷移はしない（Repository のトランザクションで担保）。
 * webhook feature から直接 import せず、コンポジションルートでこの関数を注入して使う。
 */
export async function applyConnectAccountUpdate(
  repo: StaffRepository,
  stripeAccountId: string,
  payoutsEnabled: boolean,
): Promise<ApplyAccountUpdateResult> {
  return repo.applyAccountUpdate(stripeAccountId, payoutsEnabled);
}
