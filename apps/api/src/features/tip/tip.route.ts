import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateTipInputSchema } from "@arigato/shared";
import type {
  StaffDisplayInfo,
  TipComplete,
  TipIntentResult,
  CreateTipInput,
} from "@arigato/shared";

/**
 * tip feature の Route 層（HTTP 入口・薄く保つ）。
 * リクエスト受信 → 検証 → Service 呼び出し → レスポンス返却のみを行う。
 * SQL・金額計算・業務ロジックは置かない。依存（Service ユースケース）は注入で受け取る。
 */

// Service ユースケースを注入で受け取る（コンポジションルートで配線）。識別子は membership（人×店）
type TipDeps = {
  getStaffDisplayInfo: (membershipId: string) => Promise<StaffDisplayInfo | null>;
  createTipIntent: (
    membershipId: string,
    input: CreateTipInput,
  ) => Promise<TipIntentResult | null>;
  getTipComplete: (membershipId: string, tipId: string) => Promise<TipComplete | null>;
};

// 完了画面のクエリ（?tipId=...）検証スキーマ
const CompleteQuerySchema = z.object({
  tipId: z.string().uuid(),
});

/**
 * tip のルーターを生成する。
 * お客さま向け（認証なし）の3エンドポイントを提供する。
 */
export function createTipRoute(deps: TipDeps) {
  const route = new Hono()
    // 投げ銭画面の表示情報（顔写真・名前・店名・一言）。membership から人＋店を解決。金額・履歴は返さない
    .get("/:membershipId", async (c) => {
      const membershipId = c.req.param("membershipId");
      const info = await deps.getStaffDisplayInfo(membershipId);
      if (!info) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(info);
    })
    // 投げ銭の作成（Stripe Direct charge）。client_secret を返す（決済確定は Webhook を正とする）
    .post("/:membershipId/intent", zValidator("json", CreateTipInputSchema), async (c) => {
      const membershipId = c.req.param("membershipId");
      const input = c.req.valid("json");
      try {
        const result = await deps.createTipIntent(membershipId, input);
        if (!result) {
          return c.json({ error: "staff_not_found" }, 404);
        }
        return c.json(result, 201);
      } catch (err) {
        // 店員さんが Connected Account 未連携で Direct charge を作れない（着金口が未準備）
        if (err instanceof Error && err.message === "staff_not_chargeable") {
          return c.json({ error: "staff_not_chargeable" }, 409);
        }
        throw err;
      }
    })
    // 完了画面の表示情報（誰に・¥◯◯・メッセージの再掲）
    .get("/:membershipId/complete", zValidator("query", CompleteQuerySchema), async (c) => {
      const membershipId = c.req.param("membershipId");
      const { tipId } = c.req.valid("query");
      const complete = await deps.getTipComplete(membershipId, tipId);
      if (!complete) {
        return c.json({ error: "tip_not_found" }, 404);
      }
      return c.json(complete);
    });

  return route;
}

export type TipRoute = ReturnType<typeof createTipRoute>;
