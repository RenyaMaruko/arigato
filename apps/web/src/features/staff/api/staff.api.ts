import {
  StaffMeSchema,
  InviteInfoSchema,
  type StaffMe,
  type InviteInfo,
  type CreateStaffProfileInput,
  type UpdateStaffProfileInput,
} from "@arigato/shared";
import { apiClient } from "../../../lib/api-client.js";

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
 * POST /staff/me — 初回プロフィールを作成する（招待コードで所属確定）。
 */
export async function createStaffProfile(
  input: CreateStaffProfileInput,
): Promise<StaffMe> {
  const res = await apiClient.staff.me.$post({ json: input });
  if (!res.ok) {
    // 招待が無効・多重作成などの業務エラーは error コードを添えて投げる
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
