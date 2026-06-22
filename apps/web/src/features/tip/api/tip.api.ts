import {
  StaffDisplayInfoSchema,
  TipIntentResultSchema,
  TipCompleteSchema,
  type StaffDisplayInfo,
  type TipIntentResult,
  type TipComplete,
  type CreateTipInput,
} from "@arigato/shared";
import { apiClient } from "../../../lib/api-client.js";

/**
 * tip feature の API 通信（Hono RPC `hc` 経由）。
 * バックの型を import して型安全に呼び、応答は shared の Zod スキーマで実行時検証する。
 * ここは「通信の関数」だけを置き、キャッシュ管理（useQuery 等）は hooks 側で行う。
 */

/**
 * GET /tip/:staffId — 投げ銭画面の表示情報を取得する。
 */
export async function fetchStaffDisplayInfo(staffId: string): Promise<StaffDisplayInfo> {
  const res = await apiClient.tip[":staffId"].$get({ param: { staffId } });
  if (!res.ok) {
    throw new Error(`staff display request failed: ${res.status}`);
  }
  return StaffDisplayInfoSchema.parse(await res.json());
}

/**
 * POST /tip/:staffId/intent — 投げ銭を作成し、Stripe Direct charge の Checkout URL を得る。
 * カード情報は自前 API に通さず、返ってきた checkoutUrl で Stripe Checkout へリダイレクトする。
 */
export async function createTipIntent(
  staffId: string,
  input: CreateTipInput,
): Promise<TipIntentResult> {
  const res = await apiClient.tip[":staffId"].intent.$post({
    param: { staffId },
    json: input,
  });
  if (!res.ok) {
    throw new Error(`tip intent request failed: ${res.status}`);
  }
  return TipIntentResultSchema.parse(await res.json());
}

/**
 * GET /tip/:staffId/complete?tipId= — 完了画面の表示情報を取得する。
 */
export async function fetchTipComplete(staffId: string, tipId: string): Promise<TipComplete> {
  const res = await apiClient.tip[":staffId"].complete.$get({
    param: { staffId },
    query: { tipId },
  });
  if (!res.ok) {
    throw new Error(`tip complete request failed: ${res.status}`);
  }
  return TipCompleteSchema.parse(await res.json());
}
