import { z } from "zod";

/**
 * store feature の共有 Zod スキーマ（フロント・バック共有）。
 * 店向けの「導入承認・スタッフ管理・感謝の可視化」の入出力の型を定義する。
 *
 * 最重要原則: 店向けの型・経路には金額（amount / customer_total / platform_fee）・残高・着金・
 * payout を一切持たせない。感謝の可視化は「件数」と「お客さまの声（メッセージ）」だけを返し、
 * 件数で順位付け・並べ替えしない（中立な並び）。
 */

// 店名・紹介の文字数上限（フォームの体験上の上限）
export const STORE_NAME_MAX_LENGTH = 60;
export const STORE_DESCRIPTION_MAX_LENGTH = 200;

// 招待ステータス（pending: 招待中 / accepted: 所属確定 / revoked: 失効）
export const StoreInviteStatusSchema = z.enum(["pending", "accepted", "revoked"]);
export type StoreInviteStatus = z.infer<typeof StoreInviteStatusSchema>;

/**
 * GET /store/me・GET /store/:storeId（店プロフィール・店ホームの基盤）の応答。
 * 名前・紹介・業種・ロゴ・導入承認の同意日時を返す。金額・残高は一切含めない。
 * 運営審査ゲート（status の pending→approved）は廃止し、店がセルフサーブで作成する。
 */
export const StoreProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  industry: z.string().nullable(),
  logoUrl: z.string().nullable(),
  // 導入承認に同意した日時（作成時に記録。未同意は null。ISO 文字列）
  adoptionAgreedAt: z.string().nullable(),
});
export type StoreProfile = z.infer<typeof StoreProfileSchema>;

/**
 * POST /store（店舗のセルフサーブ新規作成）の入力。
 * 店名（必須）と「導入承認の同意」（必須 true）。任意で紹介・業種・ロゴも受ける。
 * 同意は店自身の一手間（就業規則との整合）として求め、作成時に adoption_agreed_at を記録する。
 */
export const CreateStoreInputSchema = z.object({
  name: z.string().min(1).max(STORE_NAME_MAX_LENGTH),
  // 導入承認の同意（true でなければ作成を受け付けない）
  adoptionAgreed: z.literal(true),
  description: z.string().max(STORE_DESCRIPTION_MAX_LENGTH).optional(),
  industry: z.string().max(STORE_NAME_MAX_LENGTH).optional(),
  logoUrl: z.string().url().optional(),
});
export type CreateStoreInput = z.infer<typeof CreateStoreInputSchema>;

/**
 * PATCH /store/:storeId（店プロフィール編集）の入力。
 * 店名（必須）・紹介・業種・ロゴ URL（任意）のみ。ステータス・承認はここでは変更しない。
 */
export const UpdateStoreProfileInputSchema = z.object({
  name: z.string().min(1).max(STORE_NAME_MAX_LENGTH),
  description: z.string().max(STORE_DESCRIPTION_MAX_LENGTH).optional(),
  industry: z.string().max(STORE_NAME_MAX_LENGTH).optional(),
  logoUrl: z.string().url().optional(),
});
export type UpdateStoreProfileInput = z.infer<typeof UpdateStoreProfileInputSchema>;

/**
 * POST /store/:storeId/invites（スタッフ招待の発行・方式A）の応答。
 * 発行した招待コードと、店員さんが登録に使う招待リンク URL（/invite/:code）を返す。
 */
export const StoreInviteCreatedSchema = z.object({
  code: z.string(),
  // 店員さんに渡す招待リンク（/invite/:code を指す絶対 URL）
  inviteUrl: z.string().url(),
  status: StoreInviteStatusSchema,
  // 発行日時（ISO 文字列）
  createdAt: z.string(),
});
export type StoreInviteCreated = z.infer<typeof StoreInviteCreatedSchema>;

/**
 * GET /store/:storeId/invites の1件分（招待中一覧）。
 * 招待コード・状態・発行日時・（消費済みなら）所属した店員名を返す。金額は含めない。
 */
export const StoreInviteItemSchema = z.object({
  code: z.string(),
  status: StoreInviteStatusSchema,
  // 発行日時（ISO 文字列）
  createdAt: z.string(),
  // 招待リンク（/invite/:code を指す絶対 URL）
  inviteUrl: z.string().url(),
  // 招待を消費して所属した店員さんの表示名（未消費は null）
  acceptedStaffName: z.string().nullable(),
  // 消費（所属確定）日時（未消費は null。ISO 文字列）
  acceptedAt: z.string().nullable(),
});
export type StoreInviteItem = z.infer<typeof StoreInviteItemSchema>;

/**
 * GET /store/:storeId/invites の応答（招待一覧）。
 * pending（招待中）/ accepted（所属確定）/ revoked（失効）を新しい順に返す。
 */
export const StoreInvitesResponseSchema = z.object({
  items: z.array(StoreInviteItemSchema),
  // 招待中（pending）の件数（タブの「招待中 (N)」表示に使う）
  pendingCount: z.number().int(),
});
export type StoreInvitesResponse = z.infer<typeof StoreInvitesResponseSchema>;

/**
 * GET /store/:storeId/staff の1件分（所属スタッフ・在籍管理）。
 * 表示名・一言・顔写真のみ。金額・受取件数のランキングは持たせない（店はお金に触れない）。
 * QR は店員さん本人が発行する主体のため、店側はここで発行しない。
 */
export const StoreStaffItemSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  // 一言（任意・お客さま向けの自己紹介。店員一覧の補足行に使う）
  headline: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});
export type StoreStaffItem = z.infer<typeof StoreStaffItemSchema>;

/**
 * GET /store/:storeId/staff の応答（所属スタッフ一覧）。
 * 名簿順（在籍が古い順）の中立な並びで返す。金額・件数での並べ替えはしない。
 */
export const StoreStaffResponseSchema = z.object({
  items: z.array(StoreStaffItemSchema),
  // 在籍中の人数（タブの「在籍中 (N)」表示に使う）
  count: z.number().int(),
});
export type StoreStaffResponse = z.infer<typeof StoreStaffResponseSchema>;

/**
 * GET /store/:storeId/gratitude のお客さまの声1件分。
 * メッセージ・いつ届いたか・誰宛か（店員名）のみ。金額は一切含めない。
 */
export const GratitudeVoiceSchema = z.object({
  id: z.string().uuid(),
  // お客さまの一言メッセージ
  message: z.string(),
  // 届いた日時（ISO 文字列）
  receivedAt: z.string(),
  // 誰宛か（受け取った店員さんの表示名）
  staffName: z.string(),
});
export type GratitudeVoice = z.infer<typeof GratitudeVoiceSchema>;

/**
 * GET /store/:storeId/gratitude のスタッフ別「ありがとう件数」1件分。
 * 件数のみ（金額は持たない）。並びは名簿順（中立）で、件数では並べ替え・順位付けしない。
 */
export const GratitudePerStaffSchema = z.object({
  staffId: z.string().uuid(),
  staffName: z.string(),
  // この店員さんに届いた「ありがとう」の件数（金額ではない）
  count: z.number().int(),
});
export type GratitudePerStaff = z.infer<typeof GratitudePerStaffSchema>;

/**
 * GET /store/:storeId/gratitude の応答（感謝の可視化）。
 * 店全体の件数（合計・今日・今週・今月）と、お客さまの声フィード、スタッフ別件数を返す。
 *
 * 金額（amount / customer_total / platform_fee）・残高・着金は一切含めない（横断ルール: 店はお金に触れない）。
 * スタッフ別件数は件数で並べ替え・順位付けせず、名簿順（中立）で返す。
 */
export const StoreGratitudeSchema = z.object({
  // 店全体に届いた「ありがとう」の累計件数
  totalCount: z.number().int(),
  // 今日の件数（JST）
  todayCount: z.number().int(),
  // 今週の件数（JST・直近7日）
  weekCount: z.number().int(),
  // 今月の件数（JST・暦月）
  monthCount: z.number().int(),
  // お客さまの声フィード（メッセージのある投げ銭を新しい順に。金額なし）
  voices: z.array(GratitudeVoiceSchema),
  // スタッフ別件数（名簿順・中立な並び。件数で順位付けしない）
  perStaff: z.array(GratitudePerStaffSchema),
});
export type StoreGratitude = z.infer<typeof StoreGratitudeSchema>;
