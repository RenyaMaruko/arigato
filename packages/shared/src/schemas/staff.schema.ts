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
 * 初回プロフィール作成（POST /staff/me）で店員さん本人から受け取る入力。
 * display_name・headline（任意）・avatar_url（任意）のみ。プロフィールは人ごとに1つ。
 * 所属の確定は別途 POST /staff/me/join（招待コード）に集約するため、ここでは招待コードを受け取らない。
 * 本人確認・口座登録・Stripe Connect 連携は一切求めない（体験を登録の前に）。
 */
export const CreateStaffProfileInputSchema = z.object({
  displayName: z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH),
  // 一言（任意・空文字は未入力扱い）
  headline: z.string().max(HEADLINE_MAX_LENGTH).optional(),
  // 顔写真 URL（任意）
  avatarUrl: z.string().url().optional(),
});
export type CreateStaffProfileInput = z.infer<typeof CreateStaffProfileInputSchema>;

/**
 * 招待コードで所属（staff_store）を追加する（POST /staff/me/join）の入力。
 * 新規/既存問わず「参加の確定点」。招待コードからその店への所属を1件作る（多対多・掛け持ち）。
 */
export const JoinStoreInputSchema = z.object({
  // 店が発行した招待コード（これで所属する店が確定する＝店承認を招待で担保）
  inviteCode: z.string().min(1),
});
export type JoinStoreInput = z.infer<typeof JoinStoreInputSchema>;

// 参加（join）の結果区分。
// joined: 新たに所属が追加された（参加完了画面へ）
// rejoined: 脱退済みの所属を再有効化した（同じ membershipId＝同じ QR が復活・参加完了画面へ）
// already_member: 既に在籍中（案内へ）
export const JoinResultStatusSchema = z.enum(["joined", "rejoined", "already_member"]);
export type JoinResultStatus = z.infer<typeof JoinResultStatusSchema>;

/**
 * POST /staff/me/join の応答。
 * 参加結果（joined / already_member）と、参加した（または既に所属している）店の情報・membership を返す。
 * フロントは status で「参加しました！」と「すでに所属しています」を出し分ける。
 */
export const JoinStoreResultSchema = z.object({
  status: JoinResultStatusSchema,
  // 参加した（または既存の）所属（membership）ID。QR用URL の組み立てにも使える
  membershipId: z.string().uuid(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  // この membership の QR が指す固定 URL（/tip/:membershipId）
  tipUrl: z.string(),
});
export type JoinStoreResult = z.infer<typeof JoinStoreResultSchema>;

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
 * 所属（membership＝人×店）1件分。店ごとの QR を出すための単位。
 * 店ごとに別 QR を貼るため、QR が指す固定 URL（/tip/:membershipId）を含む。
 */
export const StaffMembershipSchema = z.object({
  // 所属（staff_store）の ID。QR の単位
  membershipId: z.string().uuid(),
  storeId: z.string().uuid(),
  storeName: z.string(),
  // 店のロゴ画像URL（未設定は null。所属店舗一覧・ホームの店カードで表示し、無ければプレースホルダ）
  logoUrl: z.string().nullable(),
  // この所属（人×店）の QR が指す固定 URL（/tip/:membershipId）。一度発行したら不変
  tipUrl: z.string(),
});
export type StaffMembership = z.infer<typeof StaffMembershipSchema>;

/**
 * 受取履歴の店舗フィルタ用の店1件分（在籍中＋脱退済みの両方を含む）。
 * その店員さんの tip がある店の distinct {storeId, storeName}。
 * QR・所属一覧は active な memberships を使うが、受取履歴のフィルタはこちら（脱退店も含む）を使う
 * （脱退した店の過去の収益も引き続き確認できるようにするため）。
 */
export const StaffReceiptStoreSchema = z.object({
  storeId: z.string().uuid(),
  storeName: z.string(),
});
export type StaffReceiptStore = z.infer<typeof StaffReceiptStoreSchema>;

/**
 * GET /staff/me の応答。
 * 自分のプロフィール（人ごと1つ）・identity_status・所属店一覧（各 membership と店ごとQR用URL）を返す。
 * 掛け持ち（複数店所属）に対応するため、所属は配列で返す。
 * 金額・残高は含めない（本人スコープの集計は別経路）。
 *
 * memberships は active（在籍中＝left_at IS NULL）のみ（QR・所属一覧・ホームの店カード用）。
 * receiptStores はその店員さんの tip がある店（在籍中＋脱退済み）で、受取履歴の店舗フィルタ用。
 */
export const StaffMeSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  headline: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  identityStatus: IdentityStatusSchema,
  // 所属店一覧（active のみ・複数可）。各所属に店ごとの QR用URL を含む。在籍が古い順（中立）
  memberships: z.array(StaffMembershipSchema),
  // 受取履歴の店舗フィルタの選択肢（在籍中＋脱退済み）。脱退店の過去収益も見られるようにする
  receiptStores: z.array(StaffReceiptStoreSchema),
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
// storeId は、ログイン済みユーザーが「既にこの店に所属しているか」を判定する材料にも使う
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

// 1ページに返す受取履歴の件数（無限スクロール用）。既定 20・上限はサーバ側で 50 にクランプする。
export const STAFF_TIPS_DEFAULT_LIMIT = 20;
export const STAFF_TIPS_MAX_LIMIT = 50;

/**
 * ISO 日時文字列の妥当性チェック（フィルタ用の from/to）。
 * Date.parse できる文字列だけを通し、それ以外（空・壊れた値）は undefined に倒す
 * （フィルタ無し扱い＝安全側）。フロント・バック共有で同じ検証を使う。
 */
const IsoDateTimeQuery = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "invalid_datetime" })
  .optional()
  .catch(undefined);

/**
 * GET /staff/me/tips のクエリ入力（キーセットページング＋フィルタ）。
 * cursor は「最後に取得した行の (receivedAt, id)」を表す不透明文字列（先頭ページは省略）。
 * limit は1ページの件数（既定 20・サーバ側で 1〜50 にクランプ）。
 * フロント・バック共有で同じ検証を使い、不正値は安全側に倒す（cursor 不正は先頭ページ扱い）。
 *
 * フィルタ（任意・list と合計の両方に同じ条件で効く）:
 *  - storeId: 店舗で絞り込む（uuid・不正値はフィルタ無し扱いに倒す）
 *  - from:    受取日時の下限（ISO 日時・>= で含む）
 *  - to:      受取日時の上限（ISO 日時・< で排他＝期間末は翌月/翌年の頭を渡す前提）
 * いずれも不正値は 400 にせず undefined（フィルタ無し）に倒す（明確に安全側）。
 */
export const StaffTipsQuerySchema = z.object({
  // 次ページの基点（不透明文字列）。先頭ページでは未指定
  cursor: z.string().optional(),
  // 1ページの件数（文字列クエリを数値に変換）。未指定・不正は既定 20、範囲外はクランプ
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STAFF_TIPS_MAX_LIMIT)
    .catch(STAFF_TIPS_DEFAULT_LIMIT)
    .optional(),
  // 店舗フィルタ（uuid）。不正値はフィルタ無し扱い（undefined）に倒す
  storeId: z.string().uuid().optional().catch(undefined),
  // 期間フィルタの下限（ISO 日時・含む）。不正値はフィルタ無し扱い
  from: IsoDateTimeQuery,
  // 期間フィルタの上限（ISO 日時・排他）。不正値はフィルタ無し扱い
  to: IsoDateTimeQuery,
});
export type StaffTipsQuery = z.infer<typeof StaffTipsQuerySchema>;

/**
 * GET /staff/me/tips の応答（受取履歴・本人のみ・無限スクロール）。
 * 成立済み（succeeded）の投げ銭を新しい順に20件ずつ返す（キーセットページング）。
 * items はそのページ分のみ。合計（totalAmount・totalCount）は「全受取」の集計値で、
 * ページに依らず一定（ページの items から計算しない・必ず全件の別集計）。本人のみ。
 */
export const StaffTipsResponseSchema = z.object({
  // このページ分の受取履歴（最大 limit 件）
  items: z.array(StaffTipItemSchema),
  // 受取総額（全受取・成立済み・手取りベース・円）。ページに依らず一定。本人のみ
  totalAmount: z.number().int(),
  // 受取総件数（全受取・成立済み）。ページに依らず一定。本人のみ
  totalCount: z.number().int(),
  // 次ページの基点（不透明文字列）。次が無ければ null（最後のページ）
  nextCursor: z.string().nullable(),
});
export type StaffTipsResponse = z.infer<typeof StaffTipsResponseSchema>;

/**
 * GET /staff/me/balance の応答（保留残高サマリ・本人のみ）。
 *
 * 残高は「3段」に分けて本人に返す（受取総額は隠さない）:
 *  - **送金できる額（sendableAmount）**＝本人確認済み かつ Stripe の実 available 残高。「送金する」の対象額・payout 上限。
 *    DB の payable 合計ではなく Stripe の実 available を正とする（#5: 残高不足の構造的回避）。
 *  - **準備中（pendingStripeAmount）**＝受け取ったが Stripe 確定待ち。available になるまで送金できない。
 *    nextAvailableOn（◯月◯日から送金できる）を併記する。
 *  - **本人確認待ち（held）＝heldAmount**＝未確認分（まず本人確認へ）。
 *
 * 旧フィールド（heldAmount / payableAmount / paidAmount / canPayout / identityStatus）は受取総額・互換のため維持する。
 * 金額を含むのは本人スコープのこの経路だけ（店・他スタッフには返さない）。
 */
export const StaffBalanceSchema = z.object({
  // 保留残高（本人確認前に成立した held の合計・円）。＝「本人確認待ち額」
  heldAmount: z.number().int(),
  // 着金可能額（本人確認後の DB payable の合計・円。受取総額・参考表示。送金可否は sendableAmount を正とする）
  payableAmount: z.number().int(),
  // 着金済（paid の合計・円。参考表示）
  paidAmount: z.number().int(),
  // 着金可能かどうか（identity_status から判定）。フロントの導線出し分けに使う
  canPayout: z.boolean(),
  // 本人確認の状態（none / pending / verified）
  identityStatus: IdentityStatusSchema,
  // 【送金できる額】本人確認済み かつ Stripe の実 available 残高（円）。「送金する」の対象額。
  // 未確認・連結アカウント未作成・残高取得失敗時は 0。
  sendableAmount: z.number().int(),
  // 【準備中（pending）額】Stripe 確定待ちの残高（円）。available になるまで送金できない
  pendingStripeAmount: z.number().int(),
  // 準備中の資金が最も早く available になる日時（ISO 文字列・「◯月◯日から送金できます」表示用）。
  // 準備中が無い／available_on を拾えない場合は null
  nextAvailableOn: z.string().nullable(),
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

/**
 * POST /staff/me/connect/account-session の応答。
 * 埋め込み型オンボーディング（Connect Embedded Components）の初期化に使う client_secret を返す。
 * フロントは loadConnectAndInitialize({ fetchClientSecret }) でこの値を使い、アプリ内に
 * Stripe の本人確認 UI（ConnectAccountOnboarding）を埋め込む（Stripe ドメインへ全画面遷移しない）。
 * 完了の判定はこの session の戻りではなく account.updated Webhook を正とする。
 */
export const ConnectAccountSessionResponseSchema = z.object({
  // Account Session の client_secret（短命・秘匿。埋め込み UI 初期化にのみ使う）
  clientSecret: z.string().min(1),
});
export type ConnectAccountSessionResponse = z.infer<typeof ConnectAccountSessionResponseSchema>;
