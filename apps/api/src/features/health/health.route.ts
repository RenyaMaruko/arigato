import { Hono } from "hono";
import type { HealthResponse } from "@arigato/shared";

/**
 * health feature の Route 層（HTTP 入口・薄く保つ）。
 * SQL や業務ロジックは書かず、Service の呼び出しとレスポンス返却のみを行う。
 * Service は引数で注入する（feature を直接 import せず、app.ts のコンポジションルートで配線するため）。
 */

// Service の依存（コンポジションルートから注入される）
type HealthDeps = {
  checkHealth: () => Promise<HealthResponse>;
};

/**
 * health のルーターを生成する。
 * GET /health で 200 と JSON（HealthResponse）を返す。
 * 戻り値の型を export し、Hono RPC（hc）でフロントが型安全に呼べるようにする。
 */
export function createHealthRoute(deps: HealthDeps) {
  const route = new Hono().get("/", async (c) => {
    // Service を呼んで結果をそのまま JSON で返す
    const result = await deps.checkHealth();
    return c.json(result);
  });

  return route;
}

// Hono RPC のためにルーターの型を公開する
export type HealthRoute = ReturnType<typeof createHealthRoute>;
