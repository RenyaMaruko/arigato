import { z } from "zod";
import { SettlementStatusSchema } from "./tip.schema.js";

/**
 * staff feature の共有 Zod スキーマ（フロント・バック共有）。
 * 本人確認の状態・プロフィール作成入力・自分のプロフィール・招待検証の型を定義する。
 * Schema First の起点で、フロントのフォーム検証とバックのリクエスト検証に同じ定義を使う。
 */

// 本人確認・着金可否の状態（none: 未着手 / pending: 審査中 / verified: 着金可能）
export const IdentityStatusSchema = z.enum(["none", "pending", "verified"]);
export type IdentityStatus = z.infer<typeof IdentityStatusSchema>;

// 表示名・一言の文字数上限（フォームの体験上の上限）
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const HEADLINE_MAX_LENGTH = 60;

/**
 * 初回プロフィール作成（POST /staff/me）でお客さま…ではなく店員さん本人から受け取る入力。
 * display_name・headline（任意）・avatar_url（任意）と、所属を確定する招待コードを受け取る。
 * 本人確認・口座登録・Stripe Connect 連携は一切求めない（体験を登録の前に）。
 */
export const CreateStaffProfileInputSchema = z.object({
  // 招待コード（店が発行。これで store_id が確定する＝店承認を招待で担保）
  inviteCode: z.string().min(1),
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  // 一言（任意・空文字は未入力扱い）
  headline: z.string().max(HEADLINE_MAX_LENGTH).optional(),
  // 顔写真 URL（任意）
  avatarUrl: z.string().url().optional(),
});
export type CreateStaffProfileInput = z.infer<typeof CreateStaffProfileInputSchema>;

/**
 * プロフィール編集（PATCH /staff/me）の入力。
 * 招待コード・所属は変更しない（display_name・headline・avatar のみ）。
 */
export const UpdateStaffProfileInputSchema = z.object({
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  headline: z.string().max(HEADLINE_MAX_LENGTH).optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateStaffProfileInput = z.infer<typeof UpdateStaffProfileInputSchema>;

/**
 * GET /staff/me の応答。
 * 自分のプロフィール・所属店・identity_status・QR用URL（/tip/:staffId）を返す。
 * 金額・残高は含めない（本実装は Sprint 5。本人スコープの集計は別経路）。
 */
export const StaffMeSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  headline: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  identityStatus: IdentityStatusSchema,
  // QR が指す固定 URL（/tip/:staffId）。一度発行したら不変
  tipUrl: z.string(),
});
export type StaffMe = z.infer<typeof StaffMeSchema>;

/**
 * GET /invites/:code の応答（認証不要）。
 * 店員さんのアカウント作成画面で「どの店に所属するか」を表示するための招待検証結果。
 * 有効（pending）な招待のときのみ店情報を返す。
 */
export const InviteInfoSchema = z.object({
  code: z.string(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  // 招待が今すぐ使えるか（pending かつ店が承認済み）
  valid: z.boolean(),
});
export type InviteInfo = z.infer<typeof InviteInfoSchema>;

/**
 * GET /staff/me/tips の1件分（受取履歴・本人のみ）。
 * 「いつ・どんな文脈で・いくら」を構造化した感謝データを本人に表示するための型。
 * 金額（amount）を含むのは本人スコープのこの経路だけ（横断ルール: 金額は本人のみ）。
 */
export const StaffTipItemSchema = z.object({
  id: z.string().uuid(),
  // 店員さんに届く満額（円）。本人のみ閲覧可
  amount: z.number().int(),
  // 任意の一言メッセージ（80文字まで・未入力は null）
  message: z.string().nullable(),
  // 受け取った日時（決済成立日時。ISO 文字列）
  receivedAt: z.string(),
  // 送信時点の所属店名（後で異動しても文脈が残る）
  storeName: z.string(),
  // 着金ステータス（held: 保留 / payable: 着金可能 / paid: 着金済）
  settlementStatus: SettlementStatusSchema,
});
export type StaffTipItem = z.infer<typeof StaffTipItemSchema>;

/**
 * GET /staff/me/tips の応答（受取履歴・本人のみ）。
 * 成立済み（succeeded）の投げ銭を新しい順に返す。合計も併せて本人に返す。
 */
export const StaffTipsResponseSchema = z.object({
  items: z.array(StaffTipItemSchema),
  // 受取総額（成立済み・円）。本人のみ
  totalAmount: z.number().int(),
});
export type StaffTipsResponse = z.infer<typeof StaffTipsResponseSchema>;

/**
 * GET /staff/me/balance の応答（保留残高サマリ・本人のみ）。
 * 保留残高（held 合計）と着金可能額（payable 合計）を本人に返す。
 * 金額を含むのは本人スコープのこの経路だけ（店・他スタッフには返さない）。
 */
export const StaffBalanceSchema = z.object({
  // 保留残高（本人確認前に成立した held の合計・円）
  heldAmount: z.number().int(),
  // 着金可能額（本人確認後の payable の合計・円）
  payableAmount: z.number().int(),
  // 着金済（paid の合計・円。参考表示）
  paidAmount: z.number().int(),
  // 着金可能かどうか（identity_status から判定）。フロントの導線出し分けに使う
  canPayout: z.boolean(),
  // 本人確認の状態（none / pending / verified）
  identityStatus: IdentityStatusSchema,
});
export type StaffBalance = z.infer<typeof StaffBalanceSchema>;

/**
 * POST /staff/me/connect/onboard の応答。
 * Stripe Connect のオンボーディング（本人確認・口座登録）へ遷移する URL を返す。
 * 店員さんはこの URL に遷移して手続きし、完了は account.updated Webhook を正として反映する。
 */
export const ConnectOnboardResponseSchema = z.object({
  // Stripe が発行するオンボーディングリンク（このURLへ店員さんを遷移させる）
  onboardingUrl: z.string().url(),
});
export type ConnectOnboardResponse = z.infer<typeof ConnectOnboardResponseSchema>;
