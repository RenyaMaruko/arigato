import { Hono } from "hono";
import type { VerifiedEvent, HandleWebhookResult } from "./webhook.service.js";

/**
 * webhook feature の Route 層（HTTP 入口・薄く保つ）。
 *
 * 必須ルール:
 *  - 署名検証には「生の（raw）リクエストボディ」が必要なため、Hono の自動 JSON パースを通さず
 *    c.req.text() で raw body を取り出す（zValidator("json") などを掛けない）。
 *  - 署名が不正・欠落していれば 400 系で拒否する（検証は infrastructure 経由で注入）。
 *
 * 検証・処理本体は注入された依存（verifyEvent / handleEvent）に委譲し、Route は
 * 「raw body と署名ヘッダを渡し、結果を HTTP に変換する」ことだけを行う。
 */

// 署名検証失敗を表すエラーの判定に使う（infrastructure 由来のエラー名）
const VERIFICATION_ERROR_NAME = "WebhookVerificationError";

// Route が注入で受け取る依存（コンポジションルートで配線）
type WebhookDeps = {
  // raw body と署名ヘッダから検証済みイベントを得る（失敗時は throw）
  verifyEvent: (rawBody: string, signatureHeader: string | undefined) => VerifiedEvent;
  // 検証済みイベントを処理する（冪等性・tip 更新）
  handleEvent: (event: VerifiedEvent) => Promise<HandleWebhookResult>;
};

/**
 * Stripe Webhook のルーターを生成する。
 * POST /webhooks/stripe を1本だけ提供する（認証なし・raw body）。
 */
export function createWebhookRoute(deps: WebhookDeps) {
  const route = new Hono().post("/stripe", async (c) => {
    // ★ raw body をそのまま取り出す（JSON パースを通さない）。署名検証に必須。
    const rawBody = await c.req.text();
    const signature = c.req.header("stripe-signature");

    // 署名検証（失敗したら 400 系で拒否する）
    let event: VerifiedEvent;
    try {
      event = deps.verifyEvent(rawBody, signature);
    } catch (err) {
      // 署名不正・欠落は 400（不正なリクエストとして拒否）
      if (err instanceof Error && err.name === VERIFICATION_ERROR_NAME) {
        return c.json({ error: "invalid_signature" }, 400);
      }
      // 想定外のエラーも安全側に倒して 400 で拒否する
      return c.json({ error: "webhook_error" }, 400);
    }

    // 検証済みイベントを処理（冪等性・tip 更新）。Stripe へは 200 を返す（再送を止める）
    const result = await deps.handleEvent(event);
    return c.json(result, 200);
  });

  return route;
}

export type WebhookRoute = ReturnType<typeof createWebhookRoute>;
