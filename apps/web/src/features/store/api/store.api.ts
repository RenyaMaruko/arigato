import {
  StoreProfileSchema,
  StoreInviteCreatedSchema,
  StoreInvitesResponseSchema,
  StoreStaffResponseSchema,
  StoreStaffDetailSchema,
  StoreGratitudeSchema,
  StoreAdminsResponseSchema,
  StoreOwnerLeaveResultSchema,
  LogoUploadResultSchema,
  type StoreProfile,
  type LogoUploadResult,
  type StoreInviteCreated,
  type StoreInvitesResponse,
  type StoreStaffResponse,
  type StoreStaffDetail,
  type StoreGratitude,
  type StoreAdminsResponse,
  type StoreOwnerLeaveResult,
  type UpdateStoreProfileInput,
  type CreateStoreInput,
} from "@arigato/shared";
import { apiClient } from "../../../lib/api-client.js";
import { getAccessToken } from "../../../lib/auth.js";

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
 * POST /store/:storeId/logo — 店ロゴ画像をアップロードして logo_url を更新する（オーナーのみ）。
 * multipart/form-data（field 名 "file"）で送る。hc は FormData 送信に向かないため、CSV ダウンロードと
 * 同様に fetch を直接使い、認証トークンを手で付与する。検証違反（非画像・過大）は 400 でエラーを投げる。
 */
export async function uploadStoreLogo(storeId: string, file: File): Promise<LogoUploadResult> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  // トークンはメモリ保持のセッションから同期取得する
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // FormData に画像を載せる（Content-Type は fetch が boundary 付きで自動設定する）
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${apiUrl}/store/${storeId}/logo`, {
    method: "POST",
    headers,
    body: form,
  });
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
  return LogoUploadResultSchema.parse(await res.json());
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
 * GET /store/:storeId/staff/:staffId — 在籍中スタッフ1人の詳細を取得する（基本情報・金額なし・店スコープ）。
 * 他店・脱退済み・存在しないは error を投げる。
 */
export async function fetchStoreStaffDetail(
  storeId: string,
  staffId: string,
): Promise<StoreStaffDetail> {
  const res = await apiClient.store[":storeId"].staff[":staffId"].$get({
    param: { storeId, staffId },
  });
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
  return StoreStaffDetailSchema.parse(await res.json());
}

/**
 * POST /store/:storeId/staff/:staffId/remove — 自店のスタッフを在籍解除する（論理削除・店スコープ）。
 * お金は移動しない（受け取り済みは本人のもの）。対象なし・他店は error を投げる。
 */
export async function removeStoreStaff(storeId: string, staffId: string): Promise<void> {
  const res = await apiClient.store[":storeId"].staff[":staffId"].remove.$post({
    param: { storeId, staffId },
  });
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

/**
 * GET /store/:storeId/admins — 管理者一覧を取得する（owner/admin・金額なし・店スコープ）。
 * 応答には閲覧者のロール（viewerRole）が含まれ、owner のときだけ管理者の招待・削除・owner 譲渡を出せる。
 */
export async function fetchStoreAdmins(storeId: string): Promise<StoreAdminsResponse> {
  const res = await apiClient.store[":storeId"].admins.$get({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store admins request failed: ${res.status}`);
  }
  return StoreAdminsResponseSchema.parse(await res.json());
}

/**
 * POST /store/:storeId/admin-invites — 管理者招待リンクを発行する（owner のみ）。
 * label は「誰宛か」の任意メモ。受け入れると store_admin role=admin になる。
 */
export async function createStoreAdminInvite(
  storeId: string,
  label?: string,
): Promise<StoreInviteCreated> {
  const res = await apiClient.store[":storeId"]["admin-invites"].$post({
    param: { storeId },
    json: { label },
  });
  if (!res.ok) {
    throw new Error(`store admin invite create failed: ${res.status}`);
  }
  return StoreInviteCreatedSchema.parse(await res.json());
}

/**
 * POST /store/:storeId/admins/:authUserId/remove — 管理者を外す（owner のみ・論理削除）。
 * owner は外せない（譲渡か閉店を使う）。対象なし・他店は error を投げる。
 */
export async function removeStoreAdmin(storeId: string, authUserId: string): Promise<void> {
  const res = await apiClient.store[":storeId"].admins[":authUserId"].remove.$post({
    param: { storeId, authUserId },
  });
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
}

/**
 * POST /store/:storeId/transfer-owner — owner を譲渡する（owner のみ）。
 * targetAuthUserId は active な管理者(admin)。対象が admin でない・他店は error を投げる。
 */
export async function transferStoreOwner(
  storeId: string,
  targetAuthUserId: string,
): Promise<void> {
  const res = await apiClient.store[":storeId"]["transfer-owner"].$post({
    param: { storeId },
    json: { targetAuthUserId },
  });
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
}

/**
 * POST /store/:storeId/close — 店を論理削除（閉店）する（owner のみ）。
 * QR・所属を無効化し、履歴・資金は保全する（資金は各スタッフの Stripe 口座で無影響）。
 */
export async function closeStore(storeId: string): Promise<void> {
  const res = await apiClient.store[":storeId"].close.$post({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store close failed: ${res.status}`);
  }
}

/**
 * POST /store/:storeId/owner/leave — owner が店から抜ける（owner のみ）。
 * 残る管理者がいれば最古参を自動昇格（promoted）、いなければ閉店（closed）。結果を返す。
 */
export async function leaveStoreAsOwner(storeId: string): Promise<StoreOwnerLeaveResult> {
  const res = await apiClient.store[":storeId"].owner.leave.$post({ param: { storeId } });
  if (!res.ok) {
    throw new Error(`store owner leave failed: ${res.status}`);
  }
  return StoreOwnerLeaveResultSchema.parse(await res.json());
}
