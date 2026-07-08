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
 *
 * 多対多モデル: QR は所属（membership＝人×店）を指す。各エンドポイントは membershipId を受け、
 * バックが membership から staff(人)＋store(店) を解決して表示・記録・完了再掲する。
 */

/**
 * GET /tip/:membershipId — 投げ銭画面の表示情報（人＋店）を取得する。
 */
export async function fetchStaffDisplayInfo(membershipId: string): Promise<StaffDisplayInfo> {
  const res = await apiClient.tip[":membershipId"].$get({ param: { membershipId } });
  if (!res.ok) {
    throw new Error(`staff display request failed: ${res.status}`);
  }
  return StaffDisplayInfoSchema.parse(await res.json());
}

/**
 * POST /tip/:membershipId/intent — 投げ銭を作成し、Stripe Direct charge の PaymentIntent client_secret を得る。
 * deferred intent 方式のため、決済 UI（Elements）の表示時ではなく「支払う操作の確定時」に呼ぶ。
 * カード情報は自前 API に通さず、返ってきた client_secret を stripe.confirmPayment に渡して
 * アプリ内で確定する（リダイレクトしない）。
 */
export async function createTipIntent(
  membershipId: string,
  input: CreateTipInput,
): Promise<TipIntentResult> {
  const res = await apiClient.tip[":membershipId"].intent.$post({
    param: { membershipId },
    json: input,
  });
  if (!res.ok) {
    throw new Error(`tip intent request failed: ${res.status}`);
  }
  return TipIntentResultSchema.parse(await res.json());
}

/**
 * GET /tip/:membershipId/complete?tipId= — 完了画面の表示情報を取得する。
 */
export async function fetchTipComplete(
  membershipId: string,
  tipId: string,
): Promise<TipComplete> {
  const res = await apiClient.tip[":membershipId"].complete.$get({
    param: { membershipId },
    query: { tipId },
  });
  if (!res.ok) {
    throw new Error(`tip complete request failed: ${res.status}`);
  }
  return TipCompleteSchema.parse(await res.json());
}
