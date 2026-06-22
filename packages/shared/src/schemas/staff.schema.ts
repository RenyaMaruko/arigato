import { z } from "zod";

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
