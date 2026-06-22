import { useQuery, useMutation } from "@tanstack/react-query";
import type { CreateTipInput } from "@arigato/shared";
import {
  fetchStaffDisplayInfo,
  createTipIntent,
  fetchTipComplete,
} from "../api/tip.api.js";

/**
 * tip feature のサーバー状態フック群（TanStack Query）。
 * Page → Hook → API → Backend の流れに従い、フェッチ・キャッシュ・送信を一手に扱う。
 */

// クエリキーの一元管理（階層構造で無効化しやすくする）
export const tipKeys = {
  all: ["tip"] as const,
  staff: (staffId: string) => [...tipKeys.all, "staff", staffId] as const,
  complete: (staffId: string, tipId: string) =>
    [...tipKeys.all, "complete", staffId, tipId] as const,
};

/**
 * 投げ銭画面の表示情報（顔写真・名前・店名・一言）を取得するフック。
 */
export function useStaffDisplayInfo(staffId: string) {
  return useQuery({
    queryKey: tipKeys.staff(staffId),
    queryFn: () => fetchStaffDisplayInfo(staffId),
    enabled: Boolean(staffId),
  });
}

/**
 * 投げ銭を作成（モック決済成立まで）するミューテーション。
 * 成功すると tipId を含む結果が返り、呼び出し側が完了画面へ遷移する。
 */
export function useCreateTipIntent(staffId: string) {
  return useMutation({
    mutationFn: (input: CreateTipInput) => createTipIntent(staffId, input),
  });
}

/**
 * 完了画面の表示情報（誰に・¥◯◯・メッセージ）を取得するフック。
 */
export function useTipComplete(staffId: string, tipId: string) {
  return useQuery({
    queryKey: tipKeys.complete(staffId, tipId),
    queryFn: () => fetchTipComplete(staffId, tipId),
    enabled: Boolean(staffId) && Boolean(tipId),
  });
}
