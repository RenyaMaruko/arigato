import { randomUUID } from "node:crypto";
import type {
  StoreProfile,
  StoreInviteCreated,
  StoreInvitesResponse,
  StoreStaffResponse,
  StoreStaffDetail,
  StoreGratitude,
  StoreAdminsResponse,
  StoreManagedListResponse,
  StoreOwnerLeaveResult,
  UpdateStoreProfileInput,
  CreateStoreInput,
  CreateStoreInviteInput,
  LogoUploadResult,
} from "@arigato/shared";
import { ImageUploadMetaSchema, IMAGE_MIME_TO_EXT } from "@arigato/shared";
import {
  generateInviteCode,
  summarizeGratitudeCounts,
  buildLogoStoragePath,
  decideOwnerSuccession,
} from "./store.model.js";
import type { StoreRole } from "./store.model.js";
import type { StoreRepository, StoreRow } from "./store.repository.js";

/**
 * store feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（招待コード生成・件数集計）と Repository（DB）を組み合わせて店のユースケースを実現する。
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
    adoptionAgreedAt: row.adoptionAgreedAt,
  };
}

/**
 * 店スコープのガード（アクセス制御の中核・日常運用）。
 * storeId の店を取得し、認証済みの authUserId がその店の active な管理者（owner/admin）であることを確認する。
 * - 店が無い／閉店済み（closed_at）なら StoreNotFoundError（閉店は論理削除＝解決から除外）。
 * - active な管理者でなければ StoreForbiddenError（他店・非管理者は触れない）。
 * 通過した場合だけ店行とロール（owner/admin）を返す。日常運用の全 API はまずこれを通す。
 */
async function requireStoreAdmin(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<{ store: StoreRow; role: StoreRole }> {
  const store = await repo.findStoreById(storeId);
  // 存在しない、または閉店済み（論理削除）は「無い」ものとして扱う
  if (!store || store.closedAt !== null) {
    throw new StoreNotFoundError();
  }
  // その店の active な管理者（owner/admin）だけが操作できる
  const role = await repo.findActiveAdminRole(storeId, authUserId);
  if (!role) {
    throw new StoreForbiddenError();
  }
  return { store, role };
}

/**
 * owner 専用のガード（管理者管理・owner譲渡・店削除）。
 * requireStoreAdmin を通したうえで、ロールが owner であることを追加確認する。
 * owner でない管理者(admin)は StoreForbiddenError（owner 専用操作は admin には許さない）。
 */
async function requireStoreOwner(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreRow> {
  const { store, role } = await requireStoreAdmin(repo, authUserId, storeId);
  if (role !== "owner") {
    throw new StoreForbiddenError();
  }
  return store;
}

/**
 * 自分（ログイン中のアカウント）が管理者である店を取得する（GET /store/me）。
 * 店ホーム・設定の起点。owner を優先し、次に古参順で1件返す（フェーズ2は1店の一般ケース）。
 * どの店の管理者でもない（未作成）なら null を返し、フロントは店舗作成（セルフサーブ）導線へ誘導する。
 */
export async function getMyStore(
  repo: StoreRepository,
  authUserId: string,
): Promise<StoreProfile | null> {
  const store = await repo.findStoreForAdmin(authUserId);
  if (!store) return null;
  return toStoreProfile(store);
}

/**
 * 自分（ログイン中のアカウント）が管理する店の一覧を取得する（GET /store/mine・§11.4）。
 * 中央ナビの切替（1件なら直行・複数なら一覧から選択）に使う。owner を先頭に古参順で返す。
 * 金額・残高・件数は一切含めない（店はお金に触れない）。管理する店が無ければ空配列。
 */
export async function listMyManagedStores(
  repo: StoreRepository,
  authUserId: string,
): Promise<StoreManagedListResponse> {
  const rows = await repo.listManagedStores(authUserId);
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      logoUrl: r.logoUrl,
      role: r.role,
    })),
  };
}

/**
 * 店舗をセルフサーブで新規作成する（POST /store）。
 * ログイン中のアカウントを所有者にし、店名等と「導入承認の同意」を受けて作成する。
 * 同意（adoption_agreed_at）は Repository が作成時刻で記録する（店自身の一手間）。
 * 運営の事前発行・claim・承認ゲートは廃止し、ここで自己登録を完結させる。
 *
 * 複数店舗（§11.4）: 1アカウントで何店でも作れる（既に店を管理していても新規作成を許す）。
 * フェーズ2の「1アカウント1店」制限は撤廃した。作成後は店員ホームへ戻り、中央ナビの切替で管理モードに入る。
 */
export async function createStore(
  repo: StoreRepository,
  authUserId: string,
  input: CreateStoreInput,
): Promise<StoreProfile> {
  // 空文字の任意項目は未入力（null）に正規化して保存する
  const normalize = (v: string | undefined): string | null => {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  };

  // 店の作成と同時に作成者を owner（store_admin role=owner）にする（Repository が1トランザクションで行う）
  const created = await repo.createStoreWithOwner({
    creatorAuthUserId: authUserId,
    name: input.name.trim(),
    description: normalize(input.description),
    industry: normalize(input.industry),
    logoUrl: input.logoUrl ?? null,
  });
  return toStoreProfile(created);
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
  const { store } = await requireStoreAdmin(repo, authUserId, storeId);
  return toStoreProfile(store);
}

/**
 * 店プロフィールを更新する（PATCH /store/:storeId）。店スコープ。
 * 名前・紹介・業種・ロゴのみ更新する。導入承認の同意・金額は変更しない。
 */
export async function updateStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  input: UpdateStoreProfileInput,
): Promise<StoreProfile> {
  await requireStoreAdmin(repo, authUserId, storeId);
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

// 画像を公開バケットへアップロードする infrastructure 関数の型（コンポジションルートで注入）。
// path（保存先）・本体・MIME を受け取り、公開URLを返す。feature は Supabase を直接知らない。
export type UploadPublicImage = (params: {
  path: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
}) => Promise<{ path: string; publicUrl: string }>;

// 画像アップロードの検証違反（MIME が画像でない／サイズ上限超過）。Route で 400 に変換する。
export class InvalidImageError extends Error {
  constructor() {
    super("invalid_image");
    this.name = "InvalidImageError";
  }
}

/**
 * 店ロゴ画像をアップロードして自店の logo_url を更新する（POST /store/:storeId/logo・店スコープ）。
 *
 * 流れ:
 *  1. 自店の管理者（owner / admin＝店情報編集の権限者・§3.1）であることを確認する（他店のロゴは変えられない）。
 *  2. サーバ側で検証する（MIME が許可画像か・サイズ上限内か）。違反は InvalidImageError（400）。
 *  3. Storage（公開バケット）へ logos/<storeId>/<uuid>.<ext> で保存し、公開URLを得る（infrastructure 経由）。
 *  4. 自店の store.logo_url を公開URLへ更新する（生 SQL は Repository）。
 *  5. { logoUrl } を返す。
 */
export async function uploadStoreLogo(
  repo: StoreRepository,
  uploadImage: UploadPublicImage,
  authUserId: string,
  storeId: string,
  file: { body: ArrayBuffer; contentType: string },
): Promise<LogoUploadResult> {
  // 【1】自店の管理者確認（owner / admin。他店は触れない）。違反は StoreForbiddenError → Route で 404。
  await requireStoreAdmin(repo, authUserId, storeId);

  // 【2】サーバ側検証（MIME・サイズ）。違反は 400（InvalidImageError）。
  const meta = ImageUploadMetaSchema.safeParse({
    contentType: file.contentType,
    sizeBytes: file.body.byteLength,
  });
  if (!meta.success) {
    throw new InvalidImageError();
  }

  // 【3】公開バケットへ保存する（logos/<storeId>/<uuid>.<ext>）
  const ext = IMAGE_MIME_TO_EXT[meta.data.contentType] ?? "bin";
  const path = buildLogoStoragePath(storeId, randomUUID(), ext);
  const { publicUrl } = await uploadImage({
    path,
    body: file.body,
    contentType: meta.data.contentType,
  });

  // 【4】自店の logo_url を公開URLへ更新する
  await repo.setLogoUrl(storeId, publicUrl);

  // 【5】公開URLを返す
  return { logoUrl: publicUrl };
}

// 招待リンク URL を組み立てる関数の型（フロントのベース URL から作る・コンポジションルートで注入）
export type BuildInviteUrl = (code: string) => string;

// QR が指す固定 URL（/tip/:membershipId）を組み立てる関数の型。
// staff feature と同じ組み立て（buildTipUrl）をコンポジションルート（app.ts）で注入する
// （feature 同士は直接 import しないため、ここでは関数の契約だけを持つ）。
export type BuildTipUrl = (membershipId: string) => string;

/**
 * スタッフ招待を発行する（POST /store/:storeId/invites・方式A）。店スコープ。
 * 一意の招待コードを生成して保存し、店員さんに渡す招待リンク URL（/invite/:code）を返す。
 * この招待リンクから登録した店員さんは自動で自店に所属する（招待で店承認を担保）。
 *
 * input.label は「誰宛か」の任意メモ（招待中一覧での識別に使う）。空・未入力は null に正規化し、
 * 無記名の招待として発行する（手軽さを壊さない）。
 */
export async function createStoreInvite(
  repo: StoreRepository,
  buildInviteUrl: BuildInviteUrl,
  authUserId: string,
  storeId: string,
  input?: CreateStoreInviteInput,
): Promise<StoreInviteCreated> {
  await requireStoreAdmin(repo, authUserId, storeId);
  // ラベル（誰宛かの任意メモ）を正規化する。空白のみ・未入力は無記名（null）にする
  const rawLabel = input?.label;
  const label = rawLabel != null && rawLabel.trim() !== "" ? rawLabel.trim() : null;
  // 一意の招待コードを生成する（Model の純粋関数）
  const code = generateInviteCode();
  const invite = await repo.createInvite(storeId, code, label);
  return {
    code: invite.code,
    inviteUrl: buildInviteUrl(invite.code),
    status: invite.status,
    createdAt: invite.createdAt,
    label: invite.label,
  };
}

/**
 * 管理者招待を発行する（POST /store/:storeId/admin-invites・§3.2）。owner のみ。
 * スタッフ招待（createStoreInvite）と仕組みは同じだが、type='admin' の招待を発行し、
 * 権限は requireStoreOwner（管理者招待は owner のみ）にする。受け入れると store_admin role=admin になる。
 * ロールは発行時に確定（受け手は選ばない・常に role=admin）。
 */
export async function createStoreAdminInvite(
  repo: StoreRepository,
  buildInviteUrl: BuildInviteUrl,
  authUserId: string,
  storeId: string,
  input?: CreateStoreInviteInput,
): Promise<StoreInviteCreated> {
  // 管理者招待は owner のみが発行できる
  await requireStoreOwner(repo, authUserId, storeId);
  // ラベル（誰宛かの任意メモ）を正規化する。空白のみ・未入力は無記名（null）にする
  const rawLabel = input?.label;
  const label = rawLabel != null && rawLabel.trim() !== "" ? rawLabel.trim() : null;
  const code = generateInviteCode();
  const invite = await repo.createAdminInvite(storeId, code, label);
  return {
    code: invite.code,
    inviteUrl: buildInviteUrl(invite.code),
    status: invite.status,
    createdAt: invite.createdAt,
    label: invite.label,
  };
}

/**
 * 管理者一覧を取得する（GET /store/:storeId/admins・店の管理モード）。店スコープ。
 * その店の active な管理者（owner/admin）を owner 先頭・古参順で返す。金額は含めない。
 * 閲覧はその店の管理者（owner/admin）なら可（requireStoreAdmin）。応答には閲覧者のロール（viewerRole）を含め、
 * フロントは owner のときだけ管理者の招待・削除・owner 譲渡ボタンを出す。
 */
export async function listStoreAdmins(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreAdminsResponse> {
  const { role } = await requireStoreAdmin(repo, authUserId, storeId);
  const admins = await repo.listAdminsForDisplay(storeId);
  return {
    items: admins.map((a) => ({
      authUserId: a.authUserId,
      role: a.role,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      createdAt: a.createdAt,
      // 自分自身か（UI の「あなた」表示・自分を外せない/自分へ譲渡できない判定に使う）
      isSelf: a.authUserId === authUserId,
    })),
    viewerRole: role,
  };
}

/**
 * 管理者を外す（POST /store/:storeId/admins/:authUserId/remove・§3.1）。owner のみ。
 * 対象（targetAuthUserId）の active な管理者(admin)を論理削除（left_at）する。
 * owner は外せない（owner を外すには owner 譲渡か店の閉店を使う）。お金は移動しない（店はお金に触れない）。
 *
 * - owner でない・他店・非管理者は 404/403 相当（requireStoreOwner）。
 * - 対象が active な admin でない（存在しない・owner・脱退済み）なら StoreAdminNotFoundError。
 */
export async function removeStoreAdmin(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  targetAuthUserId: string,
): Promise<void> {
  await requireStoreOwner(repo, authUserId, storeId);
  const removed = await repo.removeAdmin(storeId, targetAuthUserId);
  if (removed === 0) {
    throw new StoreAdminNotFoundError();
  }
}

/**
 * 招待中（pending）の招待一覧を取得する（GET /store/:storeId/invites）。店スコープ。
 * accepted（所属確定）は在籍中タブに出るため、revoked（失効）は履歴管理しないため返さない。
 * よって全 item が pending であり、各行はリンク再コピー・取り消しの対象になる。
 */
export async function listStoreInvites(
  repo: StoreRepository,
  buildInviteUrl: BuildInviteUrl,
  authUserId: string,
  storeId: string,
): Promise<StoreInvitesResponse> {
  await requireStoreAdmin(repo, authUserId, storeId);
  const invites = await repo.listInvites(storeId);
  return {
    items: invites.map((i) => ({
      code: i.code,
      status: i.status,
      // 招待の種類（staff/admin）。招待中タブで種類ラベルを出し分ける（§11.2）
      type: i.type,
      createdAt: i.createdAt,
      inviteUrl: buildInviteUrl(i.code),
      acceptedStaffName: i.acceptedStaffName,
      acceptedAt: i.acceptedAt,
      label: i.label,
    })),
    // 招待中（pending）の件数。listInvites が pending のみ返すので全件が pending
    pendingCount: invites.filter((i) => i.status === "pending").length,
  };
}

// 取り消し対象の招待が見つからない（既に消費・失効・他店）ときのエラー（Route で 404 に変換する）
export class StoreInviteNotFoundError extends Error {
  constructor() {
    super("store_invite_not_found");
    this.name = "StoreInviteNotFoundError";
  }
}

/**
 * 自店の招待中（pending）の招待を取り消す（POST /store/:storeId/invites/:code/revoke）。店スコープ。
 * pending を revoked にするだけで、取り消した招待は招待中一覧（pending のみ）から自然に消える。
 * 自店・pending のみが対象。対象が無ければ StoreInviteNotFoundError（既に消費・失効・他店）。
 */
export async function revokeStoreInvite(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  code: string,
): Promise<void> {
  // 自店の所有者であることを先に確認する（他店の招待は触れない）
  await requireStoreAdmin(repo, authUserId, storeId);
  const revoked = await repo.revokeInvite(storeId, code);
  if (revoked === 0) {
    throw new StoreInviteNotFoundError();
  }
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
  await requireStoreAdmin(repo, authUserId, storeId);
  const staff = await repo.listStaff(storeId);
  return {
    items: staff.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      headline: s.headline,
      avatarUrl: s.avatarUrl,
      // 閲覧者自身なら「（自分）」を出す（owner/管理者も店員を兼ねるため一覧に自分が載る）
      isSelf: (s.authUserId ?? null) === authUserId,
    })),
    count: staff.length,
  };
}

// スタッフ詳細・在籍解除で対象スタッフが見つからない（他店・脱退済み・存在しない）ときのエラー。
// Route で 404 に変換する（在籍中のスタッフのみ詳細表示・在籍解除できる）。
export class StoreStaffNotFoundError extends Error {
  constructor() {
    super("store_staff_not_found");
    this.name = "StoreStaffNotFoundError";
  }
}

/**
 * 在籍中スタッフ1人の詳細を取得する（GET /store/:storeId/staff/:staffId）。店スコープ。
 * その店の管理者（owner/admin）であることを確認し、在籍中（left_at IS NULL）のスタッフの基本情報だけを返す。
 * membershipId（所属＝staff_store の ID）と QR が指す固定 URL（tipUrl）も返し、
 * 店側の「スタッフQR表示・印刷」に使えるようにする（QR は店員本人の QR と同じ /tip/:membershipId）。
 * 金額・受取件数は一切返さない（店はお金に触れない）。他店・脱退済み・存在しないは StoreStaffNotFoundError。
 */
export async function getStoreStaffDetail(
  repo: StoreRepository,
  buildTipUrl: BuildTipUrl,
  authUserId: string,
  storeId: string,
  staffId: string,
): Promise<StoreStaffDetail> {
  // 閲覧者のロール（viewerRole）を取得する。owner のときだけ管理者操作を出し分ける（§11.3）
  const { role: viewerRole } = await requireStoreAdmin(repo, authUserId, storeId);
  const detail = await repo.findStaffDetail(storeId, staffId);
  if (!detail) {
    throw new StoreStaffNotFoundError();
  }
  return {
    id: detail.id,
    displayName: detail.displayName,
    headline: detail.headline,
    avatarUrl: detail.avatarUrl,
    joinedAt: detail.joinedAt,
    // 所属（membership）と QR が指す固定 URL（店側のQR表示・印刷用。金額情報は含まない）
    membershipId: detail.membershipId,
    tipUrl: buildTipUrl(detail.membershipId),
    // 対象の人（管理者操作の対象）と、その人のこの店でのロール（owner/admin/なし）
    authUserId: detail.authUserId,
    role: detail.role,
    // 閲覧者のロール（owner だけに管理者操作を出す）
    viewerRole,
  };
}

/**
 * 自店のスタッフを在籍解除する（POST /store/:storeId/staff/:staffId/remove）。店スコープ。
 * 論理削除（staff_store.left_at = now()）。物理削除しない（tip の履歴を保持＝お金は移動しない）。
 *
 * - 自店のオーナーであることを確認する（他店のスタッフは触れない＝スコープ検証）。
 * - 在籍中（left_at IS NULL）の (staff,store) のみ対象。他店・脱退済み・存在しないは StoreStaffNotFoundError。
 * - 解除後はその店員さんが在籍中一覧・記録のスタッフ別・選択肢から消えるが、その店員さん本人の
 *   受取履歴・収益はそのまま残る（お金は移動しない＝受け取り済みは本人のもの）。
 * - その店員さんが再参加（招待からの join）すると left_at が null に戻り、同じ QR で復活する。
 */
export async function removeStoreStaff(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  staffId: string,
): Promise<void> {
  // 自店のオーナーであることを先に確認する（他店のスタッフは触れない）
  await requireStoreAdmin(repo, authUserId, storeId);
  const removed = await repo.removeStaff(storeId, staffId);
  if (removed === 0) {
    throw new StoreStaffNotFoundError();
  }
}

// 感謝の可視化の絞り込み（記録画面の期間セレクタから渡る from/to と、スタッフ別タブの staffId）。
// from は含む（>=）・to は排他（<）。ISO 文字列。未指定は全期間＝店ホーム互換。
// staffId（任意）は voices だけに効く。totalCount・weekCount・perStaff は staffId に関わらず全スタッフ集計のまま。
export type GratitudePeriod = {
  from?: string;
  to?: string;
  // 特定スタッフの絞り込み（任意・uuid）。voices をそのスタッフに絞る（集計値は変えない）
  staffId?: string;
};

/**
 * 感謝の可視化を取得する（GET /store/:storeId/gratitude）。店スコープ。
 *
 * 期間（period.from/to）で絞った店全体の件数（totalCount）・お客さまの声フィード・スタッフ別件数と、
 * 期間に関わらず常に「今週」の件数（weekCount・店ホームの今週バッジ用）を返す。
 * period 未指定なら全期間を返す（店ホーム互換）。
 *
 * period.staffId（任意）を指定すると voices だけをその店員さんに絞る（スタッフ別タブの「特定スタッフ」用）。
 * totalCount・weekCount・perStaff は staffId に関わらず常に全スタッフ集計のまま——
 * ドロップダウンの選択肢（perStaff）と各スタッフの件数は staffId 絞りの影響を受けてはならない。
 *
 * 金額（amount / customer_total / platform_fee）・残高・着金は一切返さない（店はお金に触れない）。
 * 件数集計は Model の純粋関数に委ね、スタッフ別件数は名簿順（中立）のまま——件数で並べ替え・順位付けしない。
 */
export async function getStoreGratitude(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  now: Date,
  period: GratitudePeriod = {},
): Promise<StoreGratitude> {
  await requireStoreAdmin(repo, authUserId, storeId);

  // 件数集計（受取日時の全件を取得し、Model で totalCount を期間に絞り weekCount は常に今週を算出。金額は扱わない）
  const times = await repo.listGratitudeTimes(storeId);
  const counts = summarizeGratitudeCounts(times, now, { from: period.from, to: period.to });

  // お客さまの声（成立済みを新しい順に。期間で絞る。金額なし）。
  // staffId 指定時はその店員さんの声だけに絞る（特定スタッフの「メッセージ一覧」用）。
  const voices = await repo.listGratitudeVoices(
    storeId,
    GRATITUDE_VOICES_LIMIT,
    {
      from: period.from,
      to: period.to,
    },
    period.staffId,
  );

  // スタッフ別件数（名簿順・中立。期間で絞る。件数で並べ替えない）。
  // staffId に関わらず常に全スタッフ集計（ドロップダウンの選択肢・各スタッフの件数の出どころ）。
  const perStaff = await repo.listGratitudePerStaff(storeId, {
    from: period.from,
    to: period.to,
  });

  return {
    totalCount: counts.totalCount,
    weekCount: counts.weekCount,
    voices: voices.map((v) => ({
      id: v.id,
      message: v.message,
      receivedAt: v.receivedAt,
      staffName: v.staffName,
    })),
    perStaff: perStaff.map((p) => ({
      staffId: p.staffId,
      staffName: p.staffName,
      // スタッフのアバター（公開URL・無ければ null）。金額ではない（表示用の画像）
      avatarUrl: p.avatarUrl,
      count: p.count,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// owner ライフサイクル・店の論理削除（閉店）
// ─────────────────────────────────────────────────────────────

/**
 * 店を論理削除（閉店）する（POST /store/:storeId/close）。owner のみ。
 * store.closed_at をセットし、その店の QR・所属（staff_store）を無効化する（新規投げ銭を停止）。
 * 過去の受取記録・資金（tip）は保全（物理削除しない）。資金は各スタッフの Stripe 連結口座にあり、
 * 閉店で決済取消・返金は一切発生しない（横断ルール: 店はお金に触れない）。
 *
 * - owner でない管理者(admin)・他店・非管理者は 404/403 相当（requireStoreOwner）。
 * - 既に閉店済みの店は StoreNotFoundError（requireStoreOwner が閉店店を「無い」扱いにする）。
 */
export async function closeStore(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<void> {
  // owner のみが閉店できる（closed 済みは requireStoreAdmin 側で 404 になる）
  await requireStoreOwner(repo, authUserId, storeId);
  await repo.closeStore(storeId);
}

// owner 譲渡・自動継承で対象の管理者が見つからない（active な admin でない等）ときのエラー（Route で 404 に変換）
export class StoreAdminNotFoundError extends Error {
  constructor() {
    super("store_admin_not_found");
    this.name = "StoreAdminNotFoundError";
  }
}

/**
 * owner を譲渡する（POST /store/:storeId/transfer-owner）。現 owner のみ。
 * 現 owner が、その店の active な管理者(admin)1人（targetAuthUserId）を指名して owner を引き継ぐ。
 * Repository が1トランザクションで「現 owner→admin」「対象→owner」を行い、owner1人の不変条件を保つ。
 *
 * - owner でない・他店・非管理者は 404/403 相当（requireStoreOwner）。
 * - target が active な admin でない（存在しない・owner 自身・脱退済み）なら StoreAdminNotFoundError。
 */
export async function transferStoreOwner(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
  targetAuthUserId: string,
): Promise<void> {
  // 現 owner であることを確認する（owner 専用操作）
  await requireStoreOwner(repo, authUserId, storeId);
  // 指名先が active な admin であることを確認する（自分自身や owner・脱退者は不可）
  const targetRole = await repo.findActiveAdminRole(storeId, targetAuthUserId);
  if (targetRole !== "admin") {
    throw new StoreAdminNotFoundError();
  }
  // トランザクションで譲渡する（owner1人の不変条件を維持）
  await repo.transferOwner(storeId, authUserId, targetAuthUserId);
}

// owner 離脱／消失時の処理結果。
// - promoted: 残る最古参の管理者を owner へ自動昇格した（newOwnerAuthUserId が新 owner）
// - closed:   残る管理者がいないので店を論理削除（閉店）した
export type OwnerDepartureResult =
  | { action: "promoted"; newOwnerAuthUserId: string }
  | { action: "closed" };

/**
 * owner が抜ける／消える（引き継ぎ操作なしのアカウント削除等）ときの処理（owner ライフサイクル §5.4）。
 * UI トリガはフェーズ3だが、判定ロジック本体をここに実装する（テスト可能な形）。
 *
 * 流れ:
 *  1. 現 owner を論理削除（left_at=now）する（抜ける／消える）。
 *  2. 残る active な管理者(admin)を古参順で取得する。
 *  3. Model の判定（decideOwnerSuccession）で出し分ける:
 *     - 残る管理者がいれば最古参（created_at 最小）を owner へ自動昇格（店を生かす）。
 *     - 誰もいなければ店を論理削除（閉店＝closed_at）する（owner 不在の店を作らない）。
 *
 * ＝「管理者が残っていれば自動昇格／いなければ削除」の出し分け。
 */
export async function handleOwnerDeparture(
  repo: StoreRepository,
  storeId: string,
  ownerAuthUserId: string,
): Promise<OwnerDepartureResult> {
  // 【1】現 owner を外す（論理削除）
  await repo.leaveAdmin(storeId, ownerAuthUserId);

  // 【2】残る active な管理者（owner を外したので admin のみが残る）を古参順で取得する
  const remaining = await repo.listActiveAdmins(storeId);

  // 【3】判定（純粋関数）: 残る管理者がいれば最古参を昇格、いなければ閉店
  const decision = decideOwnerSuccession(
    remaining.map((a) => ({ authUserId: a.authUserId, createdAt: a.createdAt })),
  );

  if (decision.kind === "promote") {
    // 最古参の管理者を owner へ自動昇格する（店を生かす）
    await repo.promoteAdminToOwner(storeId, decision.authUserId);
    return { action: "promoted", newOwnerAuthUserId: decision.authUserId };
  }

  // 残る管理者がいない → 店を論理削除（閉店）する
  await repo.closeStore(storeId);
  return { action: "closed" };
}

/**
 * owner が店から抜ける（POST /store/:storeId/owner/leave・owner ライフサイクル §5.4 の UI トリガ）。owner のみ。
 * requireStoreOwner を通したうえで handleOwnerDeparture を呼び、残る管理者がいれば最古参を自動昇格、
 * いなければ店を論理削除（閉店）する。結果（promoted / closed）をフロントに返す（案内の出し分け）。
 * 資金・受取履歴は保全（店はお金に触れない）。
 */
export async function leaveStoreAsOwner(
  repo: StoreRepository,
  authUserId: string,
  storeId: string,
): Promise<StoreOwnerLeaveResult> {
  // owner のみが「抜ける」操作を行える（閉店済みは requireStoreAdmin 側で 404）
  await requireStoreOwner(repo, authUserId, storeId);
  const result = await handleOwnerDeparture(repo, storeId, authUserId);
  return {
    action: result.action,
    // 自動昇格したときだけ新 owner を返す（閉店時は null）
    newOwnerAuthUserId: result.action === "promoted" ? result.newOwnerAuthUserId : null,
  };
}
