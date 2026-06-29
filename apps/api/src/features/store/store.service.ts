import { randomUUID } from "node:crypto";
import type {
  StoreProfile,
  StoreInviteCreated,
  StoreInvitesResponse,
  StoreStaffResponse,
  StoreGratitude,
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
} from "./store.model.js";
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
 * 店ホーム・設定の起点。未作成（どの店も所有していない）なら null を返し、
 * フロントは店舗作成（セルフサーブ）導線へ誘導する。
 */
export async function getMyStore(
  repo: StoreRepository,
  authUserId: string,
): Promise<StoreProfile | null> {
  const store = await repo.findStoreByOwner(authUserId);
  if (!store) return null;
  return toStoreProfile(store);
}

// 店舗の重複作成（1アカウント1店舗）を防ぐためのエラー（Route で 409 に変換する）
export class StoreAlreadyExistsError extends Error {
  constructor() {
    super("store_already_exists");
    this.name = "StoreAlreadyExistsError";
  }
}

/**
 * 店舗をセルフサーブで新規作成する（POST /store）。
 * ログイン中の店アカウントを所有者にし、店名等と「導入承認の同意」を受けて作成する。
 * 同意（adoption_agreed_at）は Repository が作成時刻で記録する（店自身の一手間）。
 * 運営の事前発行・claim・承認ゲートは廃止し、ここで自己登録を完結させる。
 *
 * - 既に自分の店があれば多重作成を防ぐ（StoreAlreadyExistsError・1アカウント1店舗）。
 */
export async function createStore(
  repo: StoreRepository,
  authUserId: string,
  input: CreateStoreInput,
): Promise<StoreProfile> {
  // 多重作成の防止（同じ auth ユーザーは1つの店のみ所有する）
  const existing = await repo.findStoreByOwner(authUserId);
  if (existing) {
    throw new StoreAlreadyExistsError();
  }

  // 空文字の任意項目は未入力（null）に正規化して保存する
  const normalize = (v: string | undefined): string | null => {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  };

  const created = await repo.createStore({
    ownerAuthUserId: authUserId,
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
  const store = await requireOwnedStore(repo, authUserId, storeId);
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
 *  1. 自店のオーナーであることを確認する（他店のロゴは変えられない）。
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
  // 【1】自店のオーナー確認（他店は触れない）。違反は StoreForbiddenError → Route で 404。
  await requireOwnedStore(repo, authUserId, storeId);

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
  await requireOwnedStore(repo, authUserId, storeId);
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
  await requireOwnedStore(repo, authUserId, storeId);
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
  await requireOwnedStore(repo, authUserId, storeId);

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
