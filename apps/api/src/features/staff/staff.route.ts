import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateStaffProfileInputSchema,
  UpdateStaffProfileInputSchema,
  type StaffMe,
  type InviteInfo,
  type CreateStaffProfileInput,
  type UpdateStaffProfileInput,
} from "@arigato/shared";
import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../../middleware/auth.js";
import {
  InviteNotUsableError,
  StaffAlreadyExistsError,
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
  updateStaffProfile: (
    authUserId: string,
    input: UpdateStaffProfileInput,
  ) => Promise<StaffMe | null>;
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
    // 初回プロフィール作成（招待コードで所属確定・本人確認なしで成立）
    .post("/me", zValidator("json", CreateStaffProfileInputSchema), async (c) => {
      const authUser = c.get("authUser");
      const input = c.req.valid("json");
      try {
        const me = await deps.createStaffProfile(authUser.id, input);
        return c.json(me, 201);
      } catch (err) {
        // 招待が無効（消費済み・失効・店未承認）
        if (err instanceof InviteNotUsableError) {
          return c.json({ error: "invite_not_usable" }, 409);
        }
        // 既にプロフィール作成済み（多重作成）
        if (err instanceof StaffAlreadyExistsError) {
          return c.json({ error: "staff_already_exists" }, 409);
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
