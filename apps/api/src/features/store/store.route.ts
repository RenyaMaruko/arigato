import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  UpdateStoreProfileInputSchema,
  CreateStoreInputSchema,
  CreateStoreInviteInputSchema,
  StoreGratitudeQuerySchema,
  type StoreProfile,
  type StoreInviteCreated,
  type StoreInvitesResponse,
  type StoreStaffResponse,
  type StoreGratitude,
  type UpdateStoreProfileInput,
  type CreateStoreInput,
  type CreateStoreInviteInput,
} from "@arigato/shared";
import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import {
  StoreNotFoundError,
  StoreForbiddenError,
  StoreAlreadyExistsError,
  StoreInviteNotFoundError,
} from "./store.service.js";

/**
 * store feature の Route 層（HTTP 入口・薄く保つ）。
 * リクエスト受信 → Service 呼び出し → レスポンス返却のみ。SQL・業務ロジックは置かない。
 * 店スコープの認証必須 API には認証ミドルウェアを前置し、authUserId を検証済みトークンから渡す。
 * 依存（Service ユースケース・認証ミドルウェア）は注入で受け取り、コンポジションルートで配線する。
 *
 * 最重要原則: 店向けのどのレスポンスにも金額・残高・着金・payout を含めない。
 */

// Service ユースケースと認証ミドルウェアを注入で受け取る（コンポジションルートで配線）
type StoreDeps = {
  // 認証ミドルウェア（JWKS 検証）。全ルートに前置する
  authMiddleware: MiddlewareHandler;
  // ログイン中の店アカウントが所有する店を取得（未作成なら null）
  getMyStore: (authUserId: string) => Promise<StoreProfile | null>;
  // 店舗をセルフサーブで新規作成（店名＋導入承認の同意。作成者＝所有者）
  createStore: (authUserId: string, input: CreateStoreInput) => Promise<StoreProfile>;
  // 自店プロフィールの取得（店スコープ）
  getStore: (authUserId: string, storeId: string) => Promise<StoreProfile>;
  // 自店プロフィールの更新（店スコープ）
  updateStore: (
    authUserId: string,
    storeId: string,
    input: UpdateStoreProfileInput,
  ) => Promise<StoreProfile>;
  // スタッフ招待の発行（方式A・店スコープ）。input.label は誰宛かの任意メモ
  createStoreInvite: (
    authUserId: string,
    storeId: string,
    input: CreateStoreInviteInput,
  ) => Promise<StoreInviteCreated>;
  // 招待中（pending）の招待一覧（店スコープ）
  listStoreInvites: (authUserId: string, storeId: string) => Promise<StoreInvitesResponse>;
  // 招待中（pending）の招待を取り消す（revoke・店スコープ）
  revokeStoreInvite: (authUserId: string, storeId: string, code: string) => Promise<void>;
  // 所属スタッフ一覧（在籍管理・店スコープ）
  listStoreStaff: (authUserId: string, storeId: string) => Promise<StoreStaffResponse>;
  // 感謝の可視化（件数・お客さまの声・スタッフ別件数。金額なし・店スコープ）。
  // period（from/to・任意）でその期間に絞る（未指定は全期間＝店ホーム互換）。
  // staffId（任意）指定時は voices をその店員さんに絞る（集計値 totalCount/weekCount/perStaff は不変）。
  getStoreGratitude: (
    authUserId: string,
    storeId: string,
    period: { from?: string; to?: string; staffId?: string },
  ) => Promise<StoreGratitude>;
};

// 店スコープのアクセス制御エラーを HTTP ステータスに変換する共通ハンドラ。
// 店が無い／他店アクセスはどちらも 404 にして店の存在自体を漏らさない（情報秘匿）。
function handleStoreScopeError(err: unknown): { error: string; status: 404 } | null {
  if (err instanceof StoreNotFoundError || err instanceof StoreForbiddenError) {
    return { error: "store_not_found", status: 404 };
  }
  return null;
}

/**
 * store のルーター（店スコープ・認証必須）を生成する。/store にマウントする。
 */
export function createStoreRoute(deps: StoreDeps) {
  // 認証ミドルウェアを全ルートに前置（無効・欠落トークンは 401）
  const route = new Hono<{ Variables: AuthVariables }>()
    .use("*", deps.authMiddleware)
    // ログイン中の店アカウントが所有する店を返す（店ホーム・設定の起点）。未所有なら 404
    .get("/me", async (c) => {
      const authUser = c.get("authUser");
      const store = await deps.getMyStore(authUser.id);
      if (!store) {
        return c.json({ error: "store_not_found" }, 404);
      }
      return c.json(store);
    })
    // 店舗をセルフサーブで新規作成する（店名＋導入承認の同意。作成者＝所有者・adoption_agreed_at 記録）
    .post("/", zValidator("json", CreateStoreInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      try {
        const store = await deps.createStore(authUser.id, input);
        return c.json(store, 201);
      } catch (err) {
        // 1アカウント1店舗（既に作成済み）は 409 で返す
        if (err instanceof StoreAlreadyExistsError) {
          return c.json({ error: "store_already_exists" }, 409);
        }
        throw err;
      }
    })
    // 自店プロフィールの取得（店スコープ）
    .get("/:storeId", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const store = await deps.getStore(authUser.id, storeId);
        return c.json(store);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 自店プロフィールの更新（店スコープ）
    .patch("/:storeId", zValidator("json", UpdateStoreProfileInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      const input = c.req.valid("json");
      try {
        const store = await deps.updateStore(authUser.id, storeId, input);
        return c.json(store);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // スタッフ招待の発行（方式A・店スコープ）。body の任意 label（誰宛かのメモ）を受ける
    .post("/:storeId/invites", zValidator("json", CreateStoreInviteInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      const input = c.req.valid("json");
      try {
        const invite = await deps.createStoreInvite(authUser.id, storeId, input);
        return c.json(invite, 201);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 招待中（pending）の招待一覧（店スコープ）
    .get("/:storeId/invites", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const invites = await deps.listStoreInvites(authUser.id, storeId);
        return c.json(invites);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 招待中（pending）の招待を取り消す（revoke・店スコープ）。自店・pending のみ操作可
    .post("/:storeId/invites/:code/revoke", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      const code = c.req.param("code");
      try {
        await deps.revokeStoreInvite(authUser.id, storeId, code);
        return c.json({ ok: true });
      } catch (err) {
        // 対象の招待が無い（既に消費・失効・他店）は 404 で返す
        if (err instanceof StoreInviteNotFoundError) {
          return c.json({ error: "store_invite_not_found" }, 404);
        }
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 所属スタッフ一覧（在籍管理・店スコープ）
    .get("/:storeId/staff", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const staff = await deps.listStoreStaff(authUser.id, storeId);
        return c.json(staff);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 感謝の可視化（件数・お客さまの声・スタッフ別件数。金額なし・店スコープ）。
    // 任意クエリ from/to（ISO）で期間を絞り、任意 staffId（uuid）で voices を絞る。
    // 不正値は安全側（フィルタ無し）に倒す（.catch(undefined)）。
    .get("/:storeId/gratitude", zValidator("query", StoreGratitudeQuerySchema), async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      const { from, to, staffId } = c.req.valid("query");
      try {
        const gratitude = await deps.getStoreGratitude(authUser.id, storeId, { from, to, staffId });
        return c.json(gratitude);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    });

  return route;
}

export type StoreRoute = ReturnType<typeof createStoreRoute>;
