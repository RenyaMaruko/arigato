import { Hono } from "hono";

/**
 * staff feature の Route 層（HTTP 入口・薄く保つ）。
 * Sprint 1 ではプレースホルダのみ。認証必須の本人スコープ API は後続スプリントで追加する。
 * 依存は引数注入で受け取り、コンポジションルートで配線する。
 */

type StaffDeps = {
  resolvePayoutAvailability: (status: "none" | "pending" | "verified") => boolean;
};

/**
 * staff のルーターを生成する。
 */
export function createStaffRoute(_deps: StaffDeps) {
  const route = new Hono().get("/", (c) => {
    return c.json({ feature: "staff", ready: true });
  });

  return route;
}

export type StaffRoute = ReturnType<typeof createStaffRoute>;
