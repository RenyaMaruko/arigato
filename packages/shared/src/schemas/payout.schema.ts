import { z } from "zod";

/**
 * payout（送金＝振込申請）feature の共有 Zod スキーマ（フロント・バック共有）。
 * 手動送金（メルカリ型）の状態・送金履歴1件・送金申請結果・送金履歴一覧の型を定義する。
 * 金額は本人のみ閲覧可（送金履歴・送金結果は本人スコープのこの型でのみ返す。店向けには出さない）。
 */

// 送金ステータス（pending: 申請中 / paid: 着金済 / failed: 失敗）
export const PayoutStatusSchema = z.enum(["pending", "paid", "failed"]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

/**
 * 送金履歴1件分（GET /staff/me/payouts・本人のみ）。
 * いつ申請し・いくらを・どの状態（申請中/着金済/失敗）で・いつ着金したかを本人に表示する。
 * amount を含むのは本人スコープのこの経路だけ（横断ルール: 金額は本人のみ）。
 */
export const PayoutItemSchema = z.object({
  id: z.string().uuid(),
  // 送金額＝店員さんが銀行で受け取る額（手取り合計・円）。本人のみ閲覧可
  amount: z.number().int(),
  // 送金ステータス（pending: 申請中 / paid: 着金済 / failed: 失敗）
  status: PayoutStatusSchema,
  // 送金を申請した日時（ISO 文字列）
  createdAt: z.string(),
  // 着金日時（着金済のときのみ。未着金は null。ISO 文字列）
  arrivedAt: z.string().nullable(),
  // 失敗理由（失敗のときのみ。それ以外は null）
  failureReason: z.string().nullable(),
});
export type PayoutItem = z.infer<typeof PayoutItemSchema>;

/**
 * 送金申請（POST /staff/me/payouts）の結果。
 * 作成した送金（pending）の id・amount・status を本人に返す。
 * フロントはこの結果で「¥◯◯を送金しました（数営業日で着金）」を表示し、送金履歴を取り直す。
 */
export const CreatePayoutResultSchema = z.object({
  id: z.string().uuid(),
  // 送金額（手取り合計・円）。本人のみ
  amount: z.number().int(),
  // 申請直後のステータス（着金確定前は pending）。確定は payout.* Webhook を正とする
  status: PayoutStatusSchema,
});
export type CreatePayoutResult = z.infer<typeof CreatePayoutResultSchema>;

/**
 * 送金履歴一覧（GET /staff/me/payouts）の応答（本人のみ）。
 * 送金（payout）を新しい順に返す。金額を含むのは本人スコープのこの経路だけ。
 */
export const PayoutListSchema = z.object({
  items: z.array(PayoutItemSchema),
});
export type PayoutList = z.infer<typeof PayoutListSchema>;
