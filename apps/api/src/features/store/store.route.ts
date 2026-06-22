import { Hono } from "hono";

/**
 * store feature の Route 層（HTTP 入口・薄く保つ）。
 * Sprint 1 ではプレースホルダのみ。承認・スタッフ管理 API は後続スプリントで追加する。
 * 依存は引数注入で受け取り、コンポジションルートで配線する。
 */

type StoreDeps = {
  resolveApproval: (status: "pending" | "approved") => boolean;
};

/**
 * store のルーターを生成する。
 */
export function createStoreRoute(_deps: StoreDeps) {
  const route = new Hono().get("/", (c) => {
    return c.json({ feature: "store", ready: true });
  });

  return route;
}

export type StoreRoute = ReturnType<typeof createStoreRoute>;
