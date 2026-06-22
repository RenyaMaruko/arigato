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

// Service ユースケースを注入で受け取る（コンポジションルートで配線）
type TipDeps = {
  getStaffDisplayInfo: (staffId: string) => Promise<StaffDisplayInfo | null>;
  createTipIntent: (staffId: string, input: CreateTipInput) => Promise<TipIntentResult | null>;
  getTipComplete: (staffId: string, tipId: string) => Promise<TipComplete | null>;
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
    // 投げ銭画面の表示情報（顔写真・名前・店名・一言）。金額・履歴は返さない
    .get("/:staffId", async (c) => {
      const staffId = c.req.param("staffId");
      const info = await deps.getStaffDisplayInfo(staffId);
      if (!info) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(info);
    })
    // 投げ銭の作成（PaymentIntent 相当）。本スプリントはモック決済成立まで進める
    .post("/:staffId/intent", zValidator("json", CreateTipInputSchema), async (c) => {
      const staffId = c.req.param("staffId");
      const input = c.req.valid("json");
      const result = await deps.createTipIntent(staffId, input);
      if (!result) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(result, 201);
    })
    // 完了画面の表示情報（誰に・¥◯◯・メッセージ・スタンプの再掲）
    .get("/:staffId/complete", zValidator("query", CompleteQuerySchema), async (c) => {
      const staffId = c.req.param("staffId");
      const { tipId } = c.req.valid("query");
      const complete = await deps.getTipComplete(staffId, tipId);
      if (!complete) {
        return c.json({ error: "tip_not_found" }, 404);
      }
      return c.json(complete);
    });

  return route;
}

export type TipRoute = ReturnType<typeof createTipRoute>;
