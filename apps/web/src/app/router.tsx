import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { HomePage } from "../features/home/HomePage.js";
import { TipPage } from "../features/tip/pages/TipPage.js";
import { TipCompletePage } from "../features/tip/pages/TipCompletePage.js";

/**
 * TanStack Router のルーティング定義。
 * ホーム（疎通確認）に加え、お客さま投げ銭フローの2画面を登録する。
 *  - /tip/$staffId          投げ銭画面（金額・メッセージ・スタンプ・支払いシート）
 *  - /tip/$staffId/complete 完了画面（?tipId= で当該 tip の再掲情報を引く）
 */

// ルートルート（全画面の親。Outlet に子ルートを描画する）
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// "/" にホーム画面を割り当てる
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

// "/tip/$staffId" に投げ銭画面を割り当てる（staffId は URL パラメータ）
const tipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tip/$staffId",
  component: TipPage,
});

// "/tip/$staffId/complete" に完了画面を割り当てる。?tipId= を検証して受け取る
const tipCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tip/$staffId/complete",
  component: TipCompletePage,
  // 完了画面は tipId クエリで当該 tip を引く（文字列・任意）
  validateSearch: (search: Record<string, unknown>): { tipId: string } => ({
    tipId: typeof search.tipId === "string" ? search.tipId : "",
  }),
});

// ルートツリーを組み立てる
const routeTree = rootRoute.addChildren([indexRoute, tipRoute, tipCompleteRoute]);

export const router = createRouter({ routeTree });

// 型安全なルーティングのための型登録
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
