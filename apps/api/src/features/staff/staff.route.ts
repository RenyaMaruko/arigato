import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateStaffProfileInputSchema,
  UpdateStaffProfileInputSchema,
  JoinStoreInputSchema,
  StaffTipsQuerySchema,
  type StaffMe,
  type InviteInfo,
  type JoinStoreResult,
  type CreateStaffProfileInput,
  type UpdateStaffProfileInput,
  type StaffTipsResponse,
  type StaffBalance,
  type ConnectOnboardResponse,
  type CreatePayoutResult,
  type PayoutList,
  type AvatarUploadResult,
} from "@arigato/shared";
import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import {
  InviteNotUsableError,
  StaffAlreadyExistsError,
  StaffNotFoundError,
  MembershipNotFoundError,
  PayoutNotVerifiedError,
  PayoutBelowMinimumError,
  InvalidImageError,
} from "./staff.service.js";

/**
 * staff feature の Route 層（HTTP 入口・薄く保つ）。
 * リクエスト受信 → Service 呼び出し → レスポンス返却のみ。SQL・業務ロジックは置かない。
 * 認証必須の本人スコープ API（/staff/me 系）には認証ミドルウェアを前置する。
 * 依存（Service ユースケース・認証ミドルウェア）は注入で受け取り、コンポジションルートで配線する。
 */

// Service ユースケースと認証ミドルウェアを注入で受け取る（コンポジションルートで配線）
type StaffDeps = {
  // 認証ミドルウェア（JWKS 検証）。/staff/me 系に前置する
  authMiddleware: MiddlewareHandler;
  // 本人スコープのユースケース。authUserId は検証済みトークンから渡す
  getStaffMe: (authUserId: string) => Promise<StaffMe | null>;
  createStaffProfile: (
    authUserId: string,
    input: CreateStaffProfileInput,
  ) => Promise<StaffMe>;
  // 招待コードで所属（staff_store）を追加する（参加の確定点）。joined / rejoined / already_member を返す
  joinStore: (authUserId: string, inviteCode: string) => Promise<JoinStoreResult>;
  // 自分でその店を脱退する（論理削除）。本人スコープ。脱退後の最新 StaffMe を返す。未作成なら null。
  leaveStoreMembership: (
    authUserId: string,
    membershipId: string,
  ) => Promise<StaffMe | null>;
  updateStaffProfile: (
    authUserId: string,
    input: UpdateStaffProfileInput,
  ) => Promise<StaffMe | null>;
  // アバター画像をアップロードして avatar_url を更新する（本人のみ）。
  // 画像本体（ArrayBuffer）と MIME を受け取り、公開URLを返す。未作成なら null（404）、検証違反は例外（400）。
  uploadStaffAvatar: (
    authUserId: string,
    file: { body: ArrayBuffer; contentType: string },
  ) => Promise<AvatarUploadResult | null>;
  // 受取履歴を1ページ取得する（金額・メッセージ含む・本人のみ・キーセットページング）。未作成なら null。
  // cursor（次ページの基点）・limit（1ページ件数・既定20）を受け取る。
  getStaffTips: (
    authUserId: string,
    query: { cursor?: string; limit?: number; storeId?: string; from?: string; to?: string },
  ) => Promise<StaffTipsResponse | null>;
  // 保留残高サマリ（held 合計・着金可能額・本人のみ）。未作成なら null
  getStaffBalance: (authUserId: string) => Promise<StaffBalance | null>;
  // 申告データ CSV（受取記録）。未作成なら null
  getStaffTaxReport: (authUserId: string, year: number) => Promise<string | null>;
  // Connect オンボーディングリンク発行。未作成なら null
  startConnectOnboarding: (authUserId: string) => Promise<ConnectOnboardResponse | null>;
  // 送金（振込申請）。着金可能額の全額を銀行へ。未作成なら null（verified必須・最低額は Service が判定）
  createStaffPayout: (authUserId: string) => Promise<CreatePayoutResult | null>;
  // 送金履歴（金額・状態・申請日時・着金日時・本人のみ）。未作成なら null
  getStaffPayouts: (authUserId: string) => Promise<PayoutList | null>;
};

/**
 * staff のルーター（認証必須・本人スコープ）を生成する。/staff にマウントする。
 */
export function createStaffRoute(deps: StaffDeps) {
  // 認証ミドルウェアを全ルートに前置（無効・欠落トークンは 401）
  const route = new Hono<{ Variables: AuthVariables }>()
    .use("*", deps.authMiddleware)
    // 自分のプロフィール・identity_status・QR用URL を返す。未作成なら 404（フロントは作成へ誘導）
    .get("/me", async (c) => {
      const authUser = c.get("authUser");
      const me = await deps.getStaffMe(authUser.id);
      if (!me) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(me);
    })
    // 初回プロフィール作成（人ごと1つ・本人確認なしで成立）。所属は join で追加する
    .post("/me", zValidator("json", CreateStaffProfileInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      try {
        const me = await deps.createStaffProfile(authUser.id, input);
        return c.json(me, 201);
      } catch (err) {
        // 既にプロフィール作成済み（多重作成）
        if (err instanceof StaffAlreadyExistsError) {
          return c.json({ error: "staff_already_exists" }, 409);
        }
        throw err;
      }
    })
    // 招待コードで所属（staff_store）を追加する（参加の確定点。新規/既存問わず）
    .post("/me/join", zValidator("json", JoinStoreInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      try {
        const result = await deps.joinStore(authUser.id, input.inviteCode);
        return c.json(result, 201);
      } catch (err) {
        // 招待が無効（消費済み・失効・店未承認）
        if (err instanceof InviteNotUsableError) {
          return c.json({ error: "invite_not_usable" }, 409);
        }
        // プロフィール未作成（先に POST /staff/me が必要）
        if (err instanceof StaffNotFoundError) {
          return c.json({ error: "staff_not_found" }, 404);
        }
        throw err;
      }
    })
    // 自分でその店を脱退する（論理削除・本人スコープ）。本人かつ在籍中の membership のみ脱退できる。
    // 対象が無い（他人の所属・既に脱退済み・存在しない）は 404、未作成も 404。脱退後の StaffMe を返す。
    .post("/me/memberships/:membershipId/leave", async (c) => {
      const authUser = c.get("authUser");
      const membershipId = c.req.param("membershipId");
      try {
        const me = await deps.leaveStoreMembership(authUser.id, membershipId);
        if (!me) {
          return c.json({ error: "staff_not_found" }, 404);
        }
        return c.json(me);
      } catch (err) {
        // 対象 membership が見つからない（他人の所属・既に脱退済み・存在しない）
        if (err instanceof MembershipNotFoundError) {
          return c.json({ error: "membership_not_found" }, 404);
        }
        throw err;
      }
    })
    // 自分のプロフィール編集（display_name・headline・avatar のみ）
    .patch("/me", zValidator("json", UpdateStaffProfileInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      const me = await deps.updateStaffProfile(authUser.id, input);
      if (!me) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(me);
    })
    // アバター画像のアップロード（multipart/form-data・画像1枚。本人のみ）。
    // field 名 "file" の画像を受け取り、検証 → Storage 保存 → avatar_url 更新 → { avatarUrl } を返す。
    // 検証違反（非画像・過大）は 400、ファイル欠落は 400、未作成は 404。
    .post("/me/avatar", async (c) => {
      const authUser = c.get("authUser");
      // multipart を取得する（Hono の parseBody。file フィールドに画像本体が載る）
      const body = await c.req.parseBody();
      const file = body["file"];
      // ファイルが無い・File でない場合は不正リクエスト（400）
      if (!(file instanceof File)) {
        return c.json({ error: "invalid_image" }, 400);
      }
      try {
        const result = await deps.uploadStaffAvatar(authUser.id, {
          body: await file.arrayBuffer(),
          contentType: file.type,
        });
        if (!result) {
          return c.json({ error: "staff_not_found" }, 404);
        }
        return c.json(result);
      } catch (err) {
        // MIME が画像でない／サイズ上限超過などの検証違反は 400
        if (err instanceof InvalidImageError) {
          return c.json({ error: "invalid_image" }, 400);
        }
        throw err;
      }
    })
    // 受取履歴（金額・メッセージ・受取日時。本人のみ・20件ずつの無限スクロール）。
    // cursor（次ページの基点）・limit（既定20・上限50）はクエリで受ける。
    // cursor が不正でも Service が先頭ページ扱いにフォールバックする（落とさない）。
    .get("/me/tips", zValidator("query", StaffTipsQuerySchema), async (c) => {
      const authUser = c.get("authUser");
      // cursor/limit に加え、店舗・期間フィルタ（storeId/from/to）を受け取る。
      // 不正値は Zod が undefined に倒すため、ここでは安全側の値だけが渡る（フィルタ無し扱い）。
      const { cursor, limit, storeId, from, to } = c.req.valid("query");
      const tips = await deps.getStaffTips(authUser.id, { cursor, limit, storeId, from, to });
      if (!tips) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(tips);
    })
    // 保留残高サマリ（held 合計・着金可能額。本人のみ）
    .get("/me/balance", async (c) => {
      const authUser = c.get("authUser");
      const balance = await deps.getStaffBalance(authUser.id);
      if (!balance) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(balance);
    })
    // Stripe Connect オンボーディングリンクの発行（本人確認・口座登録へ遷移）
    .post("/me/connect/onboard", async (c) => {
      const authUser = c.get("authUser");
      const result = await deps.startConnectOnboarding(authUser.id);
      if (!result) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(result);
    })
    // 送金（振込申請）。着金可能額の全額を登録口座へ送金する（手動送金）。
    // verified でなければ 409（本人確認・口座登録が必要）、最低送金額未満／残高0なら 422 を返す。
    .post("/me/payouts", async (c) => {
      const authUser = c.get("authUser");
      try {
        const result = await deps.createStaffPayout(authUser.id);
        if (!result) {
          return c.json({ error: "staff_not_found" }, 404);
        }
        return c.json(result, 201);
      } catch (err) {
        // 本人確認・口座登録が未完了（verified でない）
        if (err instanceof PayoutNotVerifiedError) {
          return c.json({ error: "payout_not_verified" }, 409);
        }
        // 着金可能額が最低送金額に満たない（残高0を含む）
        if (err instanceof PayoutBelowMinimumError) {
          return c.json({ error: "payout_below_minimum" }, 422);
        }
        throw err;
      }
    })
    // 送金履歴（いつ・いくら・状態 pending/paid/failed・着金日。本人のみ）
    .get("/me/payouts", async (c) => {
      const authUser = c.get("authUser");
      const payouts = await deps.getStaffPayouts(authUser.id);
      if (!payouts) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      return c.json(payouts);
    })
    // 申告データ CSV の出力（受取記録。本人のみ）。?year= で対象年を絞る（既定は今年）
    .get("/me/tax-report", async (c) => {
      const authUser = c.get("authUser");
      // 対象年（クエリ ?year=2025）。不正・未指定なら今年（JST）にフォールバックする
      const yearParam = c.req.query("year");
      const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : NaN;
      const year =
        Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
          ? parsedYear
          : new Date().getFullYear();

      const csv = await deps.getStaffTaxReport(authUser.id, year);
      if (csv == null) {
        return c.json({ error: "staff_not_found" }, 404);
      }
      // ブラウザがダウンロードとして扱えるよう Content-Type / Content-Disposition を付ける
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", `attachment; filename="arigato-tax-report-${year}.csv"`);
      return c.body(csv);
    });

  return route;
}

export type StaffRoute = ReturnType<typeof createStaffRoute>;

// invite ルートの依存（認証不要）
type InviteDeps = {
  getInviteInfo: (code: string) => Promise<InviteInfo | null>;
};

/**
 * 招待検証のルーター（認証不要）を生成する。/invites にマウントする。
 * 店員さんのアカウント作成画面で、招待コードから所属先の店名を表示するために使う。
 */
export function createInviteRoute(deps: InviteDeps) {
  const route = new Hono().get("/:code", async (c) => {
    const code = c.req.param("code");
    const info = await deps.getInviteInfo(code);
    if (!info) {
      return c.json({ error: "invite_not_found" }, 404);
    }
    return c.json(info);
  });

  return route;
}

export type InviteRoute = ReturnType<typeof createInviteRoute>;
