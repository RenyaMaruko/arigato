import { z } from "zod";
import { MAX_TIP_AMOUNT, MESSAGE_MAX_LENGTH, MIN_TIP_AMOUNT } from "../constants/money.js";

/**
 * 投げ銭の決済ステータス（Stripe の PaymentIntent 状態に対応）。
 */
export const TipStatusSchema = z.enum(["pending", "succeeded", "failed"]);
export type TipStatus = z.infer<typeof TipStatusSchema>;

/**
 * 着金（精算）ステータス。保留残高モデルの状態。
 * held（保留）→ payable（着金可能）→ paid（着金済）。
 * (f) refunded（返金済）/ disputed（異議申立・チャージバック）は終端状態。
 *   返金・異議の tip は残高・受取履歴・送金候補から除外する（Stripe を正とし、負残高を握りつぶさず安全に扱う）。
 */
export const SettlementStatusSchema = z.enum([
  "held",
  "payable",
  "paid",
  "refunded",
  "disputed",
]);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;

/**
 * 投げ銭を作成する際にお客さまから受け取る入力（PaymentIntent 作成リクエスト）。
 * 金額・メッセージを検証する。フロント・バックで共有する Schema First の起点。
 */
export const CreateTipInputSchema = z.object({
  // 店員さんに届く満額（円）。最小・最大の範囲で検証する。
  amount: z.number().int().min(MIN_TIP_AMOUNT).max(MAX_TIP_AMOUNT),
  // 任意の一言メッセージ（最大80文字）
  message: z.string().max(MESSAGE_MAX_LENGTH).optional(),
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
  status: TipStatusSchema,
  settlementStatus: SettlementStatusSchema,
  createdAt: z.string(),
});
export type Tip = z.infer<typeof TipSchema>;

/**
 * 投げ銭画面（GET /tip/:membershipId）の表示情報。
 * QR が指す membership（人×店）から staff(人)＋store(店) を解決し、顔写真・名前・店名・一言のみを返す。
 * 金額・履歴は返さない（横断ルール: 金額は本人のみ）。
 */
export const StaffDisplayInfoSchema = z.object({
  // 投げ銭画面の URL（/tip/:membershipId）から来る所属（membership）識別子。
  // QR が指す任意の ID を受けるため UUID 形式に限定しない
  membershipId: z.string().min(1),
  // 送り先の店員さん（人）の ID。完了画面の照合等に使う
  staffId: z.string().min(1),
  displayName: z.string(),
  headline: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  // membership の店名（この所属で表示する店）
  storeName: z.string(),
  // この QR（membership）が今お客さまからの投げ銭を受け付けているか。
  // 在籍中（left_at IS NULL）は true、脱退・在籍解除済み（left_at に値あり）は false。
  // false のとき投げ銭画面は「現在この QR は受け付けていません」と案内し、送るボタンを出さない
  // （店員さんが再参加すると同じ QR で再開する）。
  accepting: z.boolean(),
});
export type StaffDisplayInfo = z.infer<typeof StaffDisplayInfoSchema>;

/**
 * 投げ銭作成（POST /tip/:membershipId/intent）の結果。
 * Stripe Direct charge の PaymentIntent を作り、tip を pending で記録した時点の情報を返す。
 * フロントは clientSecret を Stripe Elements（Express Checkout Element ＋ Payment Element）に渡し、
 * アプリ内に埋め込んだ決済 UI で確定する（カード情報は自前 API に通さない・リダイレクトしない）。
 * Direct charge の PaymentIntent は店員さんの Connected Account 上にあるため、フロントの Stripe.js は
 * connectedAccountId（stripeAccount）を指定して初期化する必要がある。
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
  // フロントの Stripe Elements に渡す PaymentIntent の client_secret（アプリ内決済 UI の初期化に使う）
  clientSecret: z.string().min(1),
  // Direct charge の課金先 Connected Account（フロントの Stripe.js を stripeAccount 指定で初期化するため）
  connectedAccountId: z.string().min(1),
});
export type TipIntentResult = z.infer<typeof TipIntentResultSchema>;

/**
 * 完了画面（GET /tip/:staffId/complete）の表示情報。
 * 誰に・¥◯◯（当該 tip の送金額のみ）・どのメッセージを再掲する。
 */
export const TipCompleteSchema = z.object({
  tipId: z.string().uuid(),
  staffDisplayName: z.string(),
  amount: z.number().int(),
  message: z.string().nullable(),
  // 決済の確定状況（Webhook を正とする）。完了表示は succeeded 確定後に成立させる
  status: TipStatusSchema,
});
export type TipComplete = z.infer<typeof TipCompleteSchema>;
