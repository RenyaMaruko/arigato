import {
  StaffMeSchema,
  InviteInfoSchema,
  StaffTipsResponseSchema,
  StaffBalanceSchema,
  ConnectOnboardResponseSchema,
  ConnectAccountSessionResponseSchema,
  JoinStoreResultSchema,
  CreatePayoutResultSchema,
  PayoutListSchema,
  AvatarUploadResultSchema,
  type StaffMe,
  type AvatarUploadResult,
  type InviteInfo,
  type StaffTipsResponse,
  type StaffBalance,
  type ConnectOnboardResponse,
  type ConnectAccountSessionResponse,
  type JoinStoreResult,
  type CreatePayoutResult,
  type PayoutList,
  type CreateStaffProfileInput,
  type UpdateStaffProfileInput,
} from "@arigato/shared";
import { apiClient } from "../../../lib/api-client.js";
import { getAccessToken } from "../../../lib/auth.js";

/**
 * staff feature の API 通信（Hono RPC `hc` 経由）。
 * バックの型を import して型安全に呼び、応答は shared の Zod スキーマで実行時検証する。
 * キャッシュ管理（useQuery 等）は hooks 側で行い、ここは通信関数だけを置く。
 * 認証トークンの付与は api-client（authedFetch）が自動で行う。
 */

// プロフィール未作成（404）を呼び出し側が分岐できるようにするセンチネル
export const STAFF_NOT_FOUND = "staff_not_found" as const;

/**
 * GET /staff/me — 自分のプロフィール・identity_status・QR用URL を取得する。
 * 未作成（初回ログイン）の場合は null を返す（フロントはプロフィール作成へ誘導）。
 */
export async function fetchStaffMe(): Promise<StaffMe | null> {
  const res = await apiClient.staff.me.$get();
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`staff me request failed: ${res.status}`);
  }
  return StaffMeSchema.parse(await res.json());
}

/**
 * POST /staff/me — 初回プロフィールを作成する（display_name / headline のみ）。
 * 所属の確定（参加）は別途 POST /staff/me/join に集約する（多対多・掛け持ち）。
 */
export async function createStaffProfile(
  input: CreateStaffProfileInput,
): Promise<StaffMe> {
  const res = await apiClient.staff.me.$post({ json: input });
  if (!res.ok) {
    // 多重作成などの業務エラーは error コードを添えて投げる
    let code = `status_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      // JSON でなければステータスのみ
    }
    throw new Error(code);
  }
  return StaffMeSchema.parse(await res.json());
}

/**
 * POST /staff/me/join — 招待コードで所属（staff_store）を追加する（参加の確定点）。
 * 新規/既存問わず参加はここに集約する。返り値の status で
 * joined（参加完了画面へ）と already_member（既に所属の案内へ）を出し分ける。
 * 招待無効（409）・プロフィール未作成（404）は error コードを添えて投げる。
 */
export async function joinStore(inviteCode: string): Promise<JoinStoreResult> {
  const res = await apiClient.staff.me.join.$post({ json: { inviteCode } });
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
  return JoinStoreResultSchema.parse(await res.json());
}

/**
 * POST /staff/me/memberships/:membershipId/leave — 自分でその店を脱退する（論理削除・本人スコープ）。
 * 脱退後は active な所属一覧（memberships）からその店が消えるが、受け取った収益は受取履歴で確認できる
 * （receiptStores に脱退店が残る）。脱退後の最新 StaffMe を返す。対象なし・未作成は error を投げる。
 */
export async function leaveMembership(membershipId: string): Promise<StaffMe> {
  const res = await apiClient.staff.me.memberships[":membershipId"].leave.$post({
    param: { membershipId },
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
  return StaffMeSchema.parse(await res.json());
}

/**
 * PATCH /staff/me — 自分のプロフィールを編集する。
 */
export async function updateStaffProfile(
  input: UpdateStaffProfileInput,
): Promise<StaffMe> {
  const res = await apiClient.staff.me.$patch({ json: input });
  if (!res.ok) {
    throw new Error(`staff profile update failed: ${res.status}`);
  }
  return StaffMeSchema.parse(await res.json());
}

/**
 * POST /staff/me/avatar — アバター画像をアップロードして avatar_url を更新する（本人のみ）。
 * multipart/form-data（field 名 "file"）で送る。hc は FormData 送信に向かないため、CSV ダウンロードと
 * 同様に fetch を直接使い、認証トークンを手で付与する。検証違反（非画像・過大）は 400 でエラーを投げる。
 */
export async function uploadStaffAvatar(file: File): Promise<AvatarUploadResult> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  // トークンはメモリ保持のセッションから同期取得する
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // FormData に画像を載せる（Content-Type は fetch が boundary 付きで自動設定するため手で付けない）
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${apiUrl}/staff/me/avatar`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    // 検証違反などはエラーコードを添えて投げる（呼び出し側で文言に変換）
    let code = `status_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      // JSON でなければステータスのみ
    }
    throw new Error(code);
  }
  return AvatarUploadResultSchema.parse(await res.json());
}

/**
 * GET /invites/:code — 招待コードを検証し、所属先の店情報を取得する（認証不要）。
 * 招待が存在しなければ null。
 */
export async function fetchInviteInfo(code: string): Promise<InviteInfo | null> {
  const res = await apiClient.invites[":code"].$get({ param: { code } });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`invite request failed: ${res.status}`);
  }
  return InviteInfoSchema.parse(await res.json());
}

// 受取履歴の絞り込み（店舗・期間）。未指定はフィルタ無し（クエリに載せない）。
export type StaffTipsFilterParams = {
  storeId?: string;
  from?: string;
  to?: string;
};

/**
 * GET /staff/me/tips — 自分の受取履歴（金額・メッセージ・受取日時）を1ページ取得する（本人のみ）。
 * 無限スクロール用にキーセットページングを使う。cursor（次ページの基点）を渡すと続きを取得する
 * （先頭ページは cursor 省略）。応答の nextCursor が次ページの基点（無ければ null＝最後のページ）。
 * 合計（totalAmount / totalCount）はフィルタ後の全受取の集計値で、ページに依らず一定。
 * 店舗（storeId）・期間（from/to）フィルタを任意で渡せる（指定があるものだけクエリに載せる）。
 * 未作成（404）の場合は null。
 */
export async function fetchStaffTips(
  cursor?: string,
  filter?: StaffTipsFilterParams,
): Promise<StaffTipsResponse | null> {
  // cursor・フィルタは値があるものだけクエリに載せる（先頭ページ・フィルタ無しは付けない）
  const query: Record<string, string> = {};
  if (cursor) query.cursor = cursor;
  if (filter?.storeId) query.storeId = filter.storeId;
  if (filter?.from) query.from = filter.from;
  if (filter?.to) query.to = filter.to;

  const res = await apiClient.staff.me.tips.$get({ query });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`staff tips request failed: ${res.status}`);
  }
  return StaffTipsResponseSchema.parse(await res.json());
}

/**
 * GET /staff/me/balance — 自分の保留残高・着金可能額を取得する（本人のみ）。
 * 未作成（404）の場合は null。
 */
export async function fetchStaffBalance(): Promise<StaffBalance | null> {
  const res = await apiClient.staff.me.balance.$get();
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`staff balance request failed: ${res.status}`);
  }
  return StaffBalanceSchema.parse(await res.json());
}

/**
 * POST /staff/me/connect/onboard — Stripe Connect オンボーディングリンクを発行する。
 * 返ってきた URL に店員さんを遷移させ、本人確認・口座登録を行う。
 */
export async function startConnectOnboard(): Promise<ConnectOnboardResponse> {
  const res = await apiClient.staff.me.connect.onboard.$post();
  if (!res.ok) {
    throw new Error(`connect onboard failed: ${res.status}`);
  }
  return ConnectOnboardResponseSchema.parse(await res.json());
}

/**
 * POST /staff/me/connect/account-session — 埋め込み型オンボーディング用の Account Session を発行する。
 * 返る client_secret を埋め込み UI の初期化（loadConnectAndInitialize の fetchClientSecret）に渡す。
 * client_secret は短命のためキャッシュせず、必要なたびにこの関数で取り直す。
 */
export async function createConnectAccountSession(): Promise<ConnectAccountSessionResponse> {
  const res = await apiClient.staff.me.connect["account-session"].$post();
  if (!res.ok) {
    throw new Error(`connect account-session failed: ${res.status}`);
  }
  return ConnectAccountSessionResponseSchema.parse(await res.json());
}

/**
 * POST /staff/me/payouts — 送金（振込申請）。着金可能額の全額を登録口座へ送金する（手動送金）。
 * 失敗時は error コードを添えて投げる（payout_not_verified＝本人確認/口座登録が必要・409 /
 * payout_below_minimum＝最低送金額に満たない・422）。呼び出し側はこのコードで案内を出し分ける。
 */
export async function createPayout(): Promise<CreatePayoutResult> {
  const res = await apiClient.staff.me.payouts.$post();
  if (!res.ok) {
    // バックの error コードをそのまま投げ、フロントで導線（本人確認誘導・残高不足案内）を出し分ける
    let code = `status_${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) code = body.error;
    } catch {
      // JSON でなければステータスのみ
    }
    throw new Error(code);
  }
  return CreatePayoutResultSchema.parse(await res.json());
}

/**
 * GET /staff/me/payouts — 自分の送金履歴（金額・状態・申請日時・着金日時）を取得する（本人のみ）。
 * 未作成（404）の場合は null。
 */
export async function fetchPayouts(): Promise<PayoutList | null> {
  const res = await apiClient.staff.me.payouts.$get();
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`staff payouts request failed: ${res.status}`);
  }
  return PayoutListSchema.parse(await res.json());
}

/**
 * GET /staff/me/tax-report — 申告データ CSV を取得し、ブラウザでダウンロードさせる（本人のみ）。
 * Blob として受け取り、一時 URL を作ってダウンロードをトリガーする。
 * hc は Blob ダウンロードに向かないため fetch を直接使い、認証トークンを手で付与する。
 */
export async function downloadTaxReport(year: number): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
  // トークンはメモリ保持のセッションから同期取得する
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  // CSV を取得（本人スコープのため認証必須）
  const res = await fetch(`${apiUrl}/staff/me/tax-report?year=${year}`, { headers });
  if (!res.ok) {
    throw new Error(`tax report download failed: ${res.status}`);
  }
  const blob = await res.blob();

  // 一時 URL を作り、隠しリンクのクリックでダウンロードを起こす
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arigato-tax-report-${year}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
