import { hc } from "hono/client";
import type { AppType } from "@arigato/api/src/app.js";

/**
 * Hono RPC クライアント（hc）。
 * バック（apps/api）の AppType を import し、型安全に API を呼べるようにする。
 * 接続先は環境変数 VITE_API_URL（未設定ならローカルの 8787）。
 */
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export const apiClient = hc<AppType>(apiUrl);
