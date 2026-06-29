import {
  StoreProfileSchema,
  StoreInviteCreatedSchema,
  StoreInvitesResponseSchema,
  StoreStaffResponseSchema,
  StoreGratitudeSchema,
  type StoreProfile,
  type StoreInviteCreated,
  type StoreInvitesResponse,
  type StoreStaffResponse,
  type StoreGratitude,
  type UpdateStoreProfileInput,
  type CreateStoreInput,
} from "@arigato/shared";
import { apiClient } from "../../../lib/api-client.js";

/**
 * store feature の API 通信（Hono RPC `hc` 経由）。
 * バックの型を import して型安全に呼び、応答は shared の Zod スキーマで実行時検証する。
 * キャッシュ管理（useQuery 等）は hooks 側で行い、ここは通信関数だけを置く。
 * 認証トークンの付与は api-client（authedFetch）が自動で行う。
 *
 * 店向けの応答には金額が含まれない（バックが返さない）。フロントも金額を組み立てない。
 */

// 店未紐付け（404）を呼び出し側が分岐できるようにするセンチネル
export const STORE_NOT_FOUND = "store_not_found" as const;

/**
 * GET /store/me — ログイン中の店アカウントが所有する店を取得する。
 * 未作成（初回ログイン）なら null を返す（フロントは店舗作成へ誘導）。
 */
export async function fetchMyStore(): Promise<StoreProfile | null> {
  const res = await apiClient.store.me.$get();
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`store me request failed: ${res.status}`);
  }
  return StoreProfileSchema.parse(await res.json());
}

/**
 * POST /store — 店舗をセルフサーブで新規作成する（店名＋導入承認の同意。作成者＝所有者）。
 * 同意（adoptionAgreed=true）は店自身の一手間として送る。エラーはコード文字列で投げ分ける。
 */
export async function createStore(input: CreateStoreInput): Promise<StoreProfile> {
  const res = await apiClient.store.$post({ json: input });
  if (!res.ok) {
    let code = `status_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      // JSON でなければステータスのみ
    }
    throw new Error(code);
  }
  return StoreProfileSchema.parse(await res.json());
}

/**
 * GET /store/:storeId — 自店プロフィールを取得する（店スコープ）。
 */
export async function fetchStore(storeId: string): Promise<StoreProfile> {
  const res = await apiClient.store[":storeId"].$get({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store request failed: ${res.status}`);
  }
  return StoreProfileSchema.parse(await res.json());
}

/**
 * PATCH /store/:storeId — 自店プロフィールを更新する（名前・紹介・業種・ロゴ）。
 */
export async function updateStore(
  storeId: string,
  input: UpdateStoreProfileInput,
): Promise<StoreProfile> {
  const res = await apiClient.store[":storeId"].$patch({ param: { storeId }, json: input });
  if (!res.ok) {
    throw new Error(`store update failed: ${res.status}`);
  }
  return StoreProfileSchema.parse(await res.json());
}

/**
 * POST /store/:storeId/invites — スタッフ招待リンクを発行する（方式A）。
 * label は「誰宛か」の任意メモ。未入力なら無記名の招待として発行する。
 */
export async function createStoreInvite(
  storeId: string,
  label?: string,
): Promise<StoreInviteCreated> {
  const res = await apiClient.store[":storeId"].invites.$post({
    param: { storeId },
    json: { label },
  });
  if (!res.ok) {
    throw new Error(`store invite create failed: ${res.status}`);
  }
  return StoreInviteCreatedSchema.parse(await res.json());
}

/**
 * GET /store/:storeId/invites — 発行済み招待の一覧を取得する（招待中・所属確定・失効）。
 */
export async function fetchStoreInvites(storeId: string): Promise<StoreInvitesResponse> {
  const res = await apiClient.store[":storeId"].invites.$get({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store invites request failed: ${res.status}`);
  }
  return StoreInvitesResponseSchema.parse(await res.json());
}

/**
 * POST /store/:storeId/invites/:code/revoke — 招待中（pending）の招待を取り消す。
 * 取り消すと招待中一覧（pending のみ）から自然に消える。自店・pending のみ操作可。
 */
export async function revokeStoreInvite(storeId: string, code: string): Promise<void> {
  const res = await apiClient.store[":storeId"].invites[":code"].revoke.$post({
    param: { storeId, code },
  });
  if (!res.ok) {
    throw new Error(`store invite revoke failed: ${res.status}`);
  }
}

/**
 * GET /store/:storeId/staff — 所属スタッフ一覧を取得する（在籍管理）。
 */
export async function fetchStoreStaff(storeId: string): Promise<StoreStaffResponse> {
  const res = await apiClient.store[":storeId"].staff.$get({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store staff request failed: ${res.status}`);
  }
  return StoreStaffResponseSchema.parse(await res.json());
}

/**
 * GET /store/:storeId/gratitude — 感謝の可視化を取得する（件数・お客さまの声・スタッフ別件数。金額なし）。
 * period（from/to・ISO）を渡すとその期間に絞る。未指定は全期間（店ホーム互換）。
 * staffId（uuid）を渡すと voices をその店員さんに絞る（集計値 totalCount/weekCount/perStaff は不変）。
 * undefined の端・空文字はクエリに載せない。
 */
export async function fetchStoreGratitude(
  storeId: string,
  period?: { from?: string; to?: string; staffId?: string },
): Promise<StoreGratitude> {
  // 指定された値だけをクエリに載せる（未指定は全期間・全スタッフ扱い）
  const query: { from?: string; to?: string; staffId?: string } = {};
  if (period?.from) query.from = period.from;
  if (period?.to) query.to = period.to;
  if (period?.staffId) query.staffId = period.staffId;

  const res = await apiClient.store[":storeId"].gratitude.$get({
    param: { storeId },
    query,
  });
  if (!res.ok) {
    throw new Error(`store gratitude request failed: ${res.status}`);
  }
  return StoreGratitudeSchema.parse(await res.json());
}
