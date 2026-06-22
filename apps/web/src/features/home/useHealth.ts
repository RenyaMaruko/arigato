import { useQuery } from "@tanstack/react-query";
import { HealthResponseSchema, type HealthResponse } from "@arigato/shared";
import { apiClient } from "../../lib/api-client.js";

/**
 * GET /health を Hono RPC 経由で叩くフック。
 * 取得結果は shared の Zod スキーマで検証し、フロント↔バックの疎通を型と実行時の両面で担保する。
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: async () => {
      // Hono RPC クライアントで型安全に /health を呼ぶ
      const res = await apiClient.health.$get();
      if (!res.ok) {
        throw new Error(`health request failed: ${res.status}`);
      }
      // 共有 Zod スキーマで応答を検証してから返す
      const json = await res.json();
      return HealthResponseSchema.parse(json);
    },
  });
}
