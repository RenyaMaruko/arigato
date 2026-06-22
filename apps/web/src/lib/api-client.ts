import { hc } from "hono/client";
import type { AppType } from "@arigato/api/src/app.js";
import { getAccessToken } from "./auth.js";

/**
 * Hono RPC クライアント（hc）。
 * バック（apps/api）の AppType を import し、型安全に API を呼べるようにする。
 * 接続先は環境変数 VITE_API_URL（未設定ならローカルの 8787）。
 *
 * 認証必須ルート（/staff/me 系）のため、Supabase の access token を
 * Authorization: Bearer で自動付与する。お客さま系（/tip）はトークンが無くても動く。
 */
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

// fetch をラップし、ログイン中ならアクセストークンを Authorization ヘッダに載せる
async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export const apiClient = hc<AppType>(apiUrl, { fetch: authedFetch });
