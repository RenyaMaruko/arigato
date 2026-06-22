import { z } from "zod";

/**
 * ヘルスチェック応答の Schema。
 * フロント（Hono RPC）とバックで同じ型を共有し、疎通確認の戻り値を検証できるようにする。
 */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
