import type { HealthResponse } from "@arigato/shared";
import { buildHealthResponse } from "./health.model.js";
import { pingDatabase } from "./health.repository.js";

/**
 * health feature の Service 層（ユースケースの指揮者）。
 * Model（純粋関数）と Repository（DB）を組み合わせてヘルスチェックを実行する。
 */

/**
 * ヘルスチェックを実行する。
 * DB 疎通の可否は内部で確認するが、結果に関わらず status は "ok" を返す
 *（API サーバ自体が生きていることを示すため。DB 状況は将来詳細化できる）。
 */
export async function checkHealth(): Promise<HealthResponse> {
  // DB 疎通確認（接続情報が無くても落とさない）
  await pingDatabase();
  // 応答の組み立ては Model 層の純粋関数に委ねる
  return buildHealthResponse("arigato-api", new Date());
}
