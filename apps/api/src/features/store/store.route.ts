import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  UpdateStoreProfileInputSchema,
  type StoreProfile,
  type StoreInviteCreated,
  type StoreInvitesResponse,
  type StoreStaffResponse,
  type StoreGratitude,
  type UpdateStoreProfileInput,
} from "@arigato/shared";
import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import { StoreNotFoundError, StoreForbiddenError } from "./store.service.js";

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
  // ログイン中の店アカウントが所有する店を取得（未所有なら null）
  getMyStore: (authUserId: string) => Promise<StoreProfile | null>;
  // 未所有の店を引き受ける（導入セットアップ）
  claimStore: (authUserId: string, storeId: string) => Promise<StoreProfile>;
  // 自店プロフィールの取得（店スコープ）
  getStore: (authUserId: string, storeId: string) => Promise<StoreProfile>;
  // 導入承認（pending→approved・店スコープ）
  approveStore: (authUserId: string, storeId: string) => Promise<StoreProfile>;
  // 自店プロフィールの更新（店スコープ）
  updateStore: (
    authUserId: string,
    storeId: string,
    input: UpdateStoreProfileInput,
  ) => Promise<StoreProfile>;
  // スタッフ招待の発行（方式A・店スコープ）
  createStoreInvite: (authUserId: string, storeId: string) => Promise<StoreInviteCreated>;
  // 発行済み招待の一覧（店スコープ）
  listStoreInvites: (authUserId: string, storeId: string) => Promise<StoreInvitesResponse>;
  // 所属スタッフ一覧（在籍管理・店スコープ）
  listStoreStaff: (authUserId: string, storeId: string) => Promise<StoreStaffResponse>;
  // 感謝の可視化（件数・お客さまの声・スタッフ別件数。金額なし・店スコープ）
  getStoreGratitude: (authUserId: string, storeId: string) => Promise<StoreGratitude>;
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
    // 未所有の店を引き受ける（導入セットアップ。店アカウントと store を紐付ける）
    .post("/:storeId/claim", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const store = await deps.claimStore(authUser.id, storeId);
        return c.json(store);
      } catch (err) {
        // 店が無いか、既に他者が所有している（横取り不可）
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
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
    // 導入承認（pending→approved・店スコープ）
    .post("/:storeId/approve", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const store = await deps.approveStore(authUser.id, storeId);
        return c.json(store);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // スタッフ招待の発行（方式A・店スコープ）
    .post("/:storeId/invites", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const invite = await deps.createStoreInvite(authUser.id, storeId);
        return c.json(invite, 201);
      } catch (err) {
        const mapped = handleStoreScopeError(err);
        if (mapped) return c.json({ error: mapped.error }, mapped.status);
        throw err;
      }
    })
    // 発行済み招待の一覧（招待中・所属確定・失効。店スコープ）
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
    // 感謝の可視化（件数・お客さまの声・スタッフ別件数。金額なし・店スコープ）
    .get("/:storeId/gratitude", async (c) => {
      const authUser = c.get("authUser");
      const storeId = c.req.param("storeId");
      try {
        const gratitude = await deps.getStoreGratitude(authUser.id, storeId);
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
