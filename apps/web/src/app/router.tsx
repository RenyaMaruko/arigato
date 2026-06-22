import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { HomePage } from "../features/home/HomePage.js";
import { TipPage } from "../features/tip/pages/TipPage.js";
import { TipCompletePage } from "../features/tip/pages/TipCompletePage.js";
import { StaffPage } from "../features/staff/pages/StaffPage.js";
import { StaffLoginPage } from "../features/staff/pages/StaffLoginPage.js";
import { StaffProfileCreatePage } from "../features/staff/pages/StaffProfileCreatePage.js";
import { StaffQrPage } from "../features/staff/pages/StaffQrPage.js";
import { StaffProfileEditPage } from "../features/staff/pages/StaffProfileEditPage.js";
import { StaffInviteAcceptPage } from "../features/staff/pages/StaffInviteAcceptPage.js";
import { StaffTipsHistoryPage } from "../features/staff/pages/StaffTipsHistoryPage.js";
import { StaffBalancePage } from "../features/staff/pages/StaffBalancePage.js";
import { StaffIdentityFlowPage } from "../features/staff/pages/StaffIdentityFlowPage.js";
import { StaffIdentityCompletePage } from "../features/staff/pages/StaffIdentityCompletePage.js";
import { StaffTaxExportPage } from "../features/staff/pages/StaffTaxExportPage.js";

/**
 * TanStack Router のルーティング定義。
 * ホーム（疎通確認）に加え、お客さま投げ銭フローと店員さんアカウント系の画面を登録する。
 *  - /tip/$staffId          投げ銭画面（金額・メッセージ・スタンプ・支払いシート）
 *  - /tip/$staffId/complete 完了画面（?tipId= で当該 tip の再掲情報を引く）
 *  - /staff                 店員さん入口（認証ゲート: 未ログイン→ログイン / 未作成→作成 / 作成済→ホーム）
 *  - /staff/setup           プロフィール作成（?invite= で招待コードを引き継ぐ）
 *  - /staff/qr              個人QR の発行（/tip/:staffId を指す QR・印刷）
 *  - /staff/profile         プロフィール編集
 *  - /invite/$code          招待受け入れ（招待検証→ログイン/作成へ）
 * 認証ガードは StaffPage 系の各画面で session を見て出し分ける（未ログインはログインへ誘導）。
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

// "/staff" 店員さん入口（認証ゲート。ログイン/作成/ホームを内部で出し分ける）
const staffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff",
  component: StaffPage,
});

// "/staff/login" ログイン画面（直接アクセス用。ログイン済みなら入口の判定でホームへ進む）
const staffLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/login",
  component: StaffLoginPage,
});

// 招待コードを ?invite= で受け取る検索バリデーション（プロフィール作成・オンボード共通）
const inviteSearch = (search: Record<string, unknown>): { invite?: string } => ({
  invite: typeof search.invite === "string" ? search.invite : undefined,
});

// "/staff/setup" プロフィール作成。?invite= で招待コードを受け取る（任意）
const staffSetupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/setup",
  component: StaffProfileCreatePage,
  validateSearch: inviteSearch,
});

// "/staff/onboard" プロフィール作成の別名（オンボード導線）。?invite= を引き継ぐ
const staffOnboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/onboard",
  component: StaffProfileCreatePage,
  validateSearch: inviteSearch,
});

// "/staff/qr" 個人QR の発行画面
const staffQrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/qr",
  component: StaffQrPage,
});

// "/staff/profile" プロフィール編集画面
const staffProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/profile",
  component: StaffProfileEditPage,
});

// "/staff/history" 受取履歴画面（金額・メッセージ・受取日時。本人のみ）
const staffHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/history",
  component: StaffTipsHistoryPage,
});

// "/staff/balance" 残高・ステータス画面（保留残高・着金可能額。本人のみ）
const staffBalanceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/balance",
  component: StaffBalancePage,
});

// "/staff/identity" 本人確認・口座登録の流れ（Connect オンボーディングへ遷移）
const staffIdentityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/identity",
  component: StaffIdentityFlowPage,
});

// "/staff/identity/complete" 本人確認完了（Stripe オンボーディングからの戻り先）
const staffIdentityCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/identity/complete",
  component: StaffIdentityCompletePage,
});

// "/staff/export" 申告データ出力（受取記録の CSV。本人のみ）
const staffExportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/export",
  component: StaffTaxExportPage,
});

// "/invite/$code" 招待受け入れ画面（招待コードは URL パラメータ）
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$code",
  component: StaffInviteAcceptPage,
});

// ルートツリーを組み立てる
const routeTree = rootRoute.addChildren([
  indexRoute,
  tipRoute,
  tipCompleteRoute,
  staffRoute,
  staffLoginRoute,
  staffSetupRoute,
  staffOnboardRoute,
  staffQrRoute,
  staffProfileRoute,
  staffHistoryRoute,
  staffBalanceRoute,
  staffIdentityRoute,
  staffIdentityCompleteRoute,
  staffExportRoute,
  inviteRoute,
]);

export const router = createRouter({ routeTree });

// 型安全なルーティングのための型登録
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
