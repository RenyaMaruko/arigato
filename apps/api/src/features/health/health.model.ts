import type { HealthResponse } from "@arigato/shared";

/**
 * health feature の Model 層（純粋関数）。
 * DB アクセスを持たず、入力から応答オブジェクトを組み立てる業務ルールのみを記述する。
 */

/**
 * ヘルスチェック応答を組み立てる純粋関数。
 * サービス名と現在時刻から HealthResponse を作る。
 */
export function buildHealthResponse(service: string, now: Date): HealthResponse {
  return {
    status: "ok",
    service,
    timestamp: now.toISOString(),
  };
}
