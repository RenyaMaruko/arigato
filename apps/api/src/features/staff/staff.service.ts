import type {
  CreateStaffProfileInput,
  UpdateStaffProfileInput,
  StaffMe,
  InviteInfo,
  JoinStoreResult,
  StaffTipsResponse,
  StaffBalance,
  ConnectOnboardResponse,
  CreatePayoutResult,
  PayoutList,
} from "@arigato/shared";
import { CURRENCY } from "@arigato/shared";
import {
  canPayout,
  isInviteUsable,
  buildTipUrl,
  normalizeHeadline,
  summarizeBalance,
  buildTaxReportCsv,
  calculateStaffTakeAmount,
  evaluatePayoutEligibility,
  selectPayoutTipsWithinAvailable,
  type IdentityStatus,
} from "./staff.model.js";
import type {
  StaffRepository,
  StaffProfileRow,
  StaffMembershipRow,
  ApplyAccountUpdateResult,
} from "./staff.repository.js";
import type {
  CreateOnboardingLinkResult,
  CreatePayoutResult as StripeCreatePayoutResult,
  ConnectBalance,
} from "../../infrastructure/stripe/stripe.types.js";

// Connected Account の実残高（available / pending / 直近の available_on）を取得する
// infrastructure 関数の型（コンポジションルートで注入）。送金可能額の正＝ Stripe available。
export type GetConnectBalance = (connectedAccountId: string) => Promise<ConnectBalance>;

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

// 連結アカウントを作成する infrastructure 関数の型（コンポジションルートで注入）。
// プロフィール作成時に呼ばれ、受け取り（charges）を前倒しで可能にする（payouts は本人確認後）。
export type CreateConnectedAccount = (
  displayName: string,
) => Promise<{ connectedAccountId: string; chargesEnabled: boolean }>;

/**
 * 初回プロフィールを作成する（POST /staff/me・本人スコープ）。
 * プロフィール（表示名・一言・写真）を人ごとに1つ作る。所属の確定はここでは行わない
 * （参加は POST /staff/me/join に集約する）。本人確認・口座登録（payout）は一切求めない。
 *
 * 「体験を登録の前に」を満たすため、プロフィール作成に続けて **連結アカウントを自動作成**し、
 * stripe_account_id を保存する（入口が招待リンクでも /staff 直アクセスでも同じ経路を通る）。
 * これにより本人確認の前でも投げ銭を受け取れる（held で溜まる）。送金は本人確認完了後。
 *
 * - 既に自分の staff があれば多重作成を防ぐ（StaffAlreadyExistsError）。
 * - 連結アカウント作成は冪等（既に stripe_account_id があれば再作成しない）。
 * - 連結アカウント作成が失敗してもプロフィール作成自体は壊さない（後追いで onboarding / tip 側が作成）。
 */
export async function createStaffProfile(
  repo: StaffRepository,
  buildUrl: BuildTipUrl,
  createConnectedAccount: CreateConnectedAccount,
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

  // プロフィール作成に続けて連結アカウントを自動作成し、受け取り（charges）を前倒しで可能にする。
  // 既に連結済みなら再作成しない（冪等）。作成失敗はプロフィール作成を巻き戻さず、ログのみ（後追いで作成）。
  const connect = await repo.findStaffConnect(authUserId);
  if (connect && !connect.stripeAccountId) {
    try {
      const result = await createConnectedAccount(profile.displayName);
      await repo.setStripeAccountId(authUserId, result.connectedAccountId);
    } catch (err) {
      // 連結アカウント作成に失敗しても、プロフィール作成は成立させる（体験を止めない）。
      // 後続の投げ銭 / オンボーディングで連結アカウントを作る経路があるため、ここではログに留める。
      console.error(
        "[staff.service] 連結アカウントの自動作成に失敗しました（プロフィールは作成済み）:",
        err instanceof Error ? err.message : err,
      );
    }
  }

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
 * 残高サマリを取得する（GET /staff/me/balance・本人スコープ）。
 *
 * 残高を「3段」に分けて本人に返す（#5: 送金可能額は Stripe の実 available を正とする）:
 *  - **送金できる額（sendableAmount）**＝本人確認済み かつ Stripe の実 available 残高。「送金する」の対象額。
 *    DB の payable 合計ではなく、Stripe から実残高を取得して正とする（残高不足の構造的回避）。
 *  - **準備中（pendingStripeAmount）**＝受け取ったが Stripe 確定待ち。nextAvailableOn（◯日後）を併記。
 *  - **本人確認待ち（heldAmount）**＝未確認分（まず本人確認へ）。
 *
 * 受取総額（held + payable + paid）は引き続き見せる（隠さない・互換のため旧フィールドを維持）。
 * Stripe 残高は connect 連携状態（stripeAccountId）があるときだけ取得する。未連携・取得失敗時は
 * sendable / pending は 0 にフォールバックし、画面（残高表示）を壊さない（DB 側の集計は必ず返す）。
 * 残高・本人確認は人ごとに集約する（全所属店をまとめる）。金額を返すのは本人スコープのこの経路だけ。
 * プロフィール未作成なら null。
 */
export async function getStaffBalance(
  repo: StaffRepository,
  getConnectBalance: GetConnectBalance,
  authUserId: string,
): Promise<StaffBalance | null> {
  const me = await repo.findStaffByAuthUserId(authUserId);
  if (!me) return null;

  // 成立済み tip の settlement 状態と金額を取得し、Model で合算する（受取総額・参考表示の正）
  const settlements = await repo.listSettlementsByAuthUserId(authUserId);
  const summary = summarizeBalance(settlements);

  // 本人確認済み（verified）か（着金可否の判定。Model の純粋関数）
  const verified = canPayout(me.identityStatus);

  // Stripe の実残高（available / pending / available_on）を取得する。
  // verified かつ Connected Account があるときだけ取得する（未確認は送金対象が無いため 0 のまま）。
  let sendableAmount = 0;
  let pendingStripeAmount = 0;
  let nextAvailableOn: string | null = null;
  const connect = await repo.findStaffConnect(authUserId);
  if (verified && connect?.stripeAccountId) {
    try {
      const balance = await getConnectBalance(connect.stripeAccountId);
      // 送金できる額＝Stripe の実 available（「送金する」の対象額）
      sendableAmount = balance.availableAmount;
      pendingStripeAmount = balance.pendingAmount;
      nextAvailableOn = balance.nextAvailableOn;
    } catch (err) {
      // Stripe 残高取得に失敗しても画面を壊さない（DB 集計は返す）。0 にフォールバックしてログのみ。
      console.error(
        "[staff.service] Stripe 残高の取得に失敗しました（DB 集計で代替表示）:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    heldAmount: summary.heldAmount,
    payableAmount: summary.payableAmount,
    paidAmount: summary.paidAmount,
    canPayout: verified,
    identityStatus: me.identityStatus,
    // 3段表示の送金できる額・準備中・期日（Stripe 実残高を正とする）
    sendableAmount,
    pendingStripeAmount,
    nextAvailableOn,
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

// Stripe payout を実行する infrastructure 関数の型（コンポジションルートで注入）。
// idempotencyKey（自前 payout 行の id）と payoutId（metadata 用・自前 payout 行の id）を渡す。
export type CreatePayout = (params: {
  connectedAccountId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  payoutId: string;
}) => Promise<StripeCreatePayoutResult>;

// 送金申請で起こりうる業務エラー（Route で HTTP ステータスに変換する）。
// 本人確認・口座登録が未完了（verified でない）。Route で 409 にする
export class PayoutNotVerifiedError extends Error {
  constructor() {
    super("payout_not_verified");
    this.name = "PayoutNotVerifiedError";
  }
}
// 着金可能額が最低送金額（¥100）に満たない（残高0を含む）。Route で 422 にする
export class PayoutBelowMinimumError extends Error {
  constructor() {
    super("payout_below_minimum");
    this.name = "PayoutBelowMinimumError";
  }
}

/**
 * 送金（振込申請）を実行する（POST /staff/me/payouts・本人スコープ）。
 * 手動送金（メルカリ型）。送金可能額は DB の payable 合計ではなく「Stripe の実 available 残高」を正とし、
 * available に収まる範囲（古い受取から FIFO）の payable tip 分だけを銀行へ送金申請する（#5）。
 * これにより available を超える送金をせず、残高不足エラーを構造的に防ぐ。
 *
 * 業務ルール（Model に集約）:
 *  - verified（着金可能＝口座登録済）でなければ PayoutNotVerifiedError。
 *  - 送金額（available に収めた手取り合計）が最低送金額（¥100）未満／available 0 なら PayoutBelowMinimumError。
 *
 * 堅牢な流れ（「Stripe 送金成功なのに DB 未記録」を構造的に防ぐ・冪等。前回の整合性対策を維持）:
 *  1. 本人の Connect 連携状態を取得。verified・Connected Account を確認（無ければ not_verified）。
 *  2. ★申請時点の Stripe available を再取得★（TOCTOU 回避。表示時と送金時で残高がズレ得るため、
 *     送金可否・上限は「今の Stripe available」で判断する）。
 *  3. payable な tip を古い順（FIFO）に取得し、手取り換算の累計が available を超えない範囲だけを
 *     送金対象に選ぶ（Model の純粋関数 selectPayoutTipsWithinAvailable）。送金額＝選んだ tip の手取り合計。
 *     可否判定（verified必須・最低¥100）。選べる額が最低額未満／0 なら below_minimum。
 *  4. ★先に DB トランザクションで★ payout 行を pending（stripe_payout_id は NULL）で作成し、
 *     選んだ payable tip を paid＋payout_id 紐付けに更新する。ここで失敗したら Stripe を呼ばない
 *     （お金は動かない＝安全）。payout 行の id を取得する。
 *  5. Stripe payout を実行する。amount は available 以下に収めた送金額。idempotency_key と
 *     metadata.payout_id に payout 行の id を使う（再試行で二重送金しない／Webhook 照合のバックアップ）。
 *  6. Stripe 成功 → payout 行に stripe_payout_id を更新する（status は pending のまま。
 *     確定は payout.paid Webhook を正とする）。
 *  7. Stripe 失敗（例外）→ DB を revert する（payout 行を status=failed＋failure_reason、
 *     対象 tip を payable へ戻す・payout_id=NULL）。エラーは呼び出し元へ再送出する。
 *
 * 着金の確定は payout.paid / payout.failed Webhook を正とする（ここでは pending で記録するだけ）。
 * available に収まらなかった payable 分（pending 由来）は payable のまま残り、available になってから次回送金できる。
 * プロフィール未作成なら null。
 */
export async function createStaffPayout(
  repo: StaffRepository,
  createPayout: CreatePayout,
  getConnectBalance: GetConnectBalance,
  authUserId: string,
): Promise<CreatePayoutResult | null> {
  // 【手順1】本人の Connect 連携状態を取得（未作成なら null → 404）
  const ctx = await repo.findPayoutContext(authUserId);
  if (!ctx) return null;

  // verified でなければ送金できない（本人確認・口座登録が必要）。Model の純粋関数で判定する。
  if (!canPayout(ctx.identityStatus)) {
    throw new PayoutNotVerifiedError();
  }
  // verified なら Connected Account が必ずある想定だが、念のため確認（着金先が無ければ送金不可）
  if (!ctx.stripeAccountId) {
    throw new PayoutNotVerifiedError();
  }

  // 【手順2】申請時点の Stripe available 残高を再取得する（TOCTOU 回避）。
  // 送金可能額・送金上限は「今の Stripe available」を正とする（DB の payable 合計ではない）。
  const balance = await getConnectBalance(ctx.stripeAccountId);
  const availableAmount = balance.availableAmount;

  // 【手順3】payable な tip を古い順（FIFO）に取得し、available に収まる範囲だけを送金対象に選ぶ。
  // 送金額＝選んだ tip の手取り合計（必ず available 以下＝残高不足にならない）。
  const payableTips = await repo.listPayableTipsByAuthUserId(authUserId);
  const selection = selectPayoutTipsWithinAvailable(payableTips, availableAmount);
  const payoutAmount = selection.amount;

  // 送金可否を判定（verified は上で確認済み・ここでは最低¥100／残高0 を弾く）。Model の純粋関数に集約。
  const eligibility = evaluatePayoutEligibility(ctx.identityStatus, payoutAmount);
  if (eligibility === "not_verified") {
    throw new PayoutNotVerifiedError();
  }
  if (eligibility === "below_minimum") {
    throw new PayoutBelowMinimumError();
  }

  // 【手順4】先に DB へ pending で記録し、選んだ payable tip を paid＋紐付けへ（トランザクション）。
  // ここで失敗すれば例外が伝播して Stripe は呼ばれない（お金は動かない＝安全）。
  const payout = await repo.createPendingPayoutAndMarkTipsPaid({
    staffId: ctx.staffId,
    amount: payoutAmount,
    tipIds: selection.tipIds,
  });

  // 【手順5】Stripe payout を実行（Connected Account の available 残高→銀行。送金手数料は店員から取らない）。
  // amount は available 以下に収めた送金額（残高不足にならない）。
  // idempotency_key・metadata.payout_id に自前 payout 行の id を使う（二重送金防止／Webhook 照合のバックアップ）。
  let stripeResult: StripeCreatePayoutResult;
  try {
    stripeResult = await createPayout({
      connectedAccountId: ctx.stripeAccountId,
      amount: payoutAmount,
      currency: CURRENCY,
      idempotencyKey: payout.id,
      payoutId: payout.id,
    });
  } catch (err) {
    // 【手順7】Stripe 失敗 → DB を revert（payout=failed＋tip を payable へ戻す）。原因を記録して再送出する。
    const reason = err instanceof Error ? err.message : "stripe_payout_failed";
    await repo.revertPayoutByPayoutId(payout.id, reason);
    throw err;
  }

  // 【手順6】Stripe 成功 → payout 行に stripe_payout_id を補完（status は pending のまま）。
  await repo.attachStripePayoutId(payout.id, stripeResult.payoutId);

  return {
    id: payout.id,
    amount: payout.amount,
    status: payout.status,
  };
}

/**
 * 送金履歴を取得する（GET /staff/me/payouts・本人スコープ）。
 * 認証済みの authUserId をキーに本人の送金（payout）だけを新しい順に返す。
 * 金額・状態・申請日時・着金日時を含むのは本人スコープのこの経路だけ（横断ルール: 金額は本人のみ）。
 * プロフィール未作成なら null。
 */
export async function getStaffPayouts(
  repo: StaffRepository,
  authUserId: string,
): Promise<PayoutList | null> {
  // 本人が存在するか（未作成なら送金履歴も無い）
  const me = await repo.findStaffByAuthUserId(authUserId);
  if (!me) return null;

  const rows = await repo.listPayoutsByAuthUserId(authUserId);
  return {
    items: rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      arrivedAt: p.arrivedAt,
      failureReason: p.failureReason,
    })),
  };
}

/**
 * payout.* （送金の着金確定・失敗）を反映する（Webhook 経由）。
 * webhook feature から直接 import せず、コンポジションルートでこの関数を注入して使う。
 *  - paid   → status=paid・arrived_at 記録（着金確定）
 *  - failed → status=failed・failure_reason 記録・該当 tip を payable へ戻す
 * 反映できたか（boolean）を返す（冪等・該当 payout 無しなら false）。
 */
export async function applyPayoutWebhookUpdate(
  repo: StaffRepository,
  params: {
    kind: "paid" | "failed";
    // Stripe Payout ID（主の照合キー）
    stripePayoutId: string;
    // 自前 payout 行の id（metadata.payout_id 由来・従の照合キー。stripe_payout_id 未補完時の保険）
    payoutId: string | null;
    arrivedAt: Date | null;
    failureReason: string | null;
  },
): Promise<boolean> {
  // 照合は stripe_payout_id を主・自前 payout 行の id を従とする（更新前に落ちても Webhook で確定できる）
  const match = { stripePayoutId: params.stripePayoutId, payoutId: params.payoutId };
  if (params.kind === "paid") {
    // 着金日時は Webhook の値（無ければ現在時刻）
    return repo.markPayoutPaid(match, params.arrivedAt ?? new Date());
  }
  return repo.markPayoutFailedAndRevertTips(match, params.failureReason);
}
