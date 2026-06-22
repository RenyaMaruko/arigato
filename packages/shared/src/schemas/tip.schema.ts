import { z } from "zod";
import { MAX_TIP_AMOUNT, MESSAGE_MAX_LENGTH, MIN_TIP_AMOUNT } from "../constants/money.js";

/**
 * 投げ銭に添えられるスタンプの種類。
 * お客さまが感情を添えるための4種（heart / smile / thumb / flower）。
 */
export const StampSchema = z.enum(["heart", "smile", "thumb", "flower"]);
export type Stamp = z.infer<typeof StampSchema>;

/**
 * 投げ銭の決済ステータス（Stripe の PaymentIntent 状態に対応）。
 */
export const TipStatusSchema = z.enum(["pending", "succeeded", "failed"]);
export type TipStatus = z.infer<typeof TipStatusSchema>;

/**
 * 着金（精算）ステータス。保留残高モデルの状態。
 * held（保留）→ payable（着金可能）→ paid（着金済）。
 */
export const SettlementStatusSchema = z.enum(["held", "payable", "paid"]);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;

/**
 * 投げ銭を作成する際にお客さまから受け取る入力（PaymentIntent 作成リクエスト）。
 * 金額・メッセージ・スタンプを検証する。フロント・バックで共有する Schema First の起点。
 */
export const CreateTipInputSchema = z.object({
  // 店員さんに届く満額（円）。最小・最大の範囲で検証する。
  amount: z.number().int().min(MIN_TIP_AMOUNT).max(MAX_TIP_AMOUNT),
  // 任意の一言メッセージ（最大80文字）
  message: z.string().max(MESSAGE_MAX_LENGTH).optional(),
  // 任意のスタンプ
  stamp: StampSchema.optional(),
});
export type CreateTipInput = z.infer<typeof CreateTipInputSchema>;

/**
 * 投げ銭1件を表すドメインモデル。
 * 「いつ・どの店で・誰が・どんな文脈で」を構造化した感謝データの中核。
 */
export const TipSchema = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid(),
  storeId: z.string().uuid(),
  amount: z.number().int(),
  platformFee: z.number().int(),
  customerTotal: z.number().int(),
  message: z.string().max(MESSAGE_MAX_LENGTH).nullable(),
  stamp: StampSchema.nullable(),
  status: TipStatusSchema,
  settlementStatus: SettlementStatusSchema,
  createdAt: z.string(),
});
export type Tip = z.infer<typeof TipSchema>;

/**
 * 投げ銭画面（GET /tip/:staffId）の表示情報。
 * 顔写真・名前・店名・一言のみを返し、金額・履歴は返さない（横断ルール: 金額は本人のみ）。
 */
export const StaffDisplayInfoSchema = z.object({
  // 投げ銭画面の URL（/tip/:staffId）から来る識別子。QR が指す任意の ID を受けるため UUID 形式に限定しない
  staffId: z.string().min(1),
  displayName: z.string(),
  headline: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  storeName: z.string(),
});
export type StaffDisplayInfo = z.infer<typeof StaffDisplayInfoSchema>;

/**
 * 投げ銭作成（POST /tip/:staffId/intent）の結果。
 * Stripe Direct charge の Checkout Session を作り、tip を pending で記録した時点の情報を返す。
 * フロントは checkoutUrl にリダイレクトして Stripe で決済する（カード情報は自前 API に通さない）。
 * 決済の確定はブラウザの戻り値ではなく Webhook を正とするため、ここでは status=pending。
 * 完了画面はこの tipId を使って GET /tip/:staffId/complete を引き、succeeded を待つ。
 */
export const TipIntentResultSchema = z.object({
  tipId: z.string().uuid(),
  // 記録時点のステータス（Webhook 確定前は pending）
  status: TipStatusSchema,
  amount: z.number().int(),
  platformFee: z.number().int(),
  customerTotal: z.number().int(),
  // お客さまをリダイレクトする Stripe Checkout の URL
  checkoutUrl: z.string().url(),
});
export type TipIntentResult = z.infer<typeof TipIntentResultSchema>;

/**
 * 完了画面（GET /tip/:staffId/complete）の表示情報。
 * 誰に・¥◯◯（当該 tip の送金額のみ）・どのメッセージ・スタンプを再掲する。
 */
export const TipCompleteSchema = z.object({
  tipId: z.string().uuid(),
  staffDisplayName: z.string(),
  amount: z.number().int(),
  message: z.string().nullable(),
  stamp: StampSchema.nullable(),
  // 決済の確定状況（Webhook を正とする）。完了表示は succeeded 確定後に成立させる
  status: TipStatusSchema,
});
export type TipComplete = z.infer<typeof TipCompleteSchema>;
