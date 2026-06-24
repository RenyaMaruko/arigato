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
import { StaffJoinCompletePage } from "../features/staff/pages/StaffJoinCompletePage.js";
import { StaffTipsHistoryPage } from "../features/staff/pages/StaffTipsHistoryPage.js";
import { StaffBalancePage } from "../features/staff/pages/StaffBalancePage.js";
import { StaffIdentityFlowPage } from "../features/staff/pages/StaffIdentityFlowPage.js";
import { StaffIdentityCompletePage } from "../features/staff/pages/StaffIdentityCompletePage.js";
import { StaffTaxExportPage } from "../features/staff/pages/StaffTaxExportPage.js";
import { StorePage } from "../features/store/pages/StorePage.js";
import { StoreLoginPage } from "../features/store/pages/StoreLoginPage.js";
import { StoreApprovalPage } from "../features/store/pages/StoreApprovalPage.js";
import { StoreStaffPage } from "../features/store/pages/StoreStaffPage.js";
import { StoreInviteCreatePage } from "../features/store/pages/StoreInviteCreatePage.js";
import { StoreInviteResendPage } from "../features/store/pages/StoreInviteResendPage.js";
import { StoreGratitudePage } from "../features/store/pages/StoreGratitudePage.js";
import { StoreSettingsPage } from "../features/store/pages/StoreSettingsPage.js";
import { StoreProfilePage } from "../features/store/pages/StoreProfilePage.js";

/**
 * TanStack Router のルーティング定義。
 * ホーム（疎通確認）に加え、お客さま投げ銭フローと店員さんアカウント系の画面を登録する。
 *  - /tip/$membershipId          投げ銭画面（membership＝人×店。金額・メッセージ・支払いシート）
 *  - /tip/$membershipId/complete 完了画面（?tipId= で当該 tip の再掲情報を引く）
 *  - /staff                      店員さん入口（認証ゲート: 未ログイン→ログイン / 未作成→作成 / 作成済→ホーム）
 *  - /staff/setup                プロフィール作成（?invite= で招待コードを引き継ぐ・作成済はガードで弾く）
 *  - /staff/qr                   店ごとのQR の発行（?m= で membership を指定・/tip/:membershipId を指す QR・印刷）
 *  - /staff/profile              プロフィール編集
 *  - /invite/$code               招待受け入れ（招待検証→ログイン/作成/参加→参加完了へ）
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

// "/tip/$membershipId" に投げ銭画面を割り当てる（membership＝人×店。URL パラメータ）
const tipRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tip/$membershipId",
  component: TipPage,
});

// "/tip/$membershipId/complete" に完了画面を割り当てる。?tipId= と ?status= を検証して受け取る
const tipCompleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tip/$membershipId/complete",
  component: TipCompletePage,
  // 完了画面は tipId クエリで当該 tip を引く（文字列・任意）。
  // status は confirmPayment の即時結果（succeeded＝即完了 / processing＝結果は後ほど）。
  // redirectStatus / paymentIntentParam は PayPay 等リダイレクト型の戻りで Stripe が付ける
  // クエリ（redirect_status / payment_intent）を受けるためのもの（完了画面で即完了判定に使う）。
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tipId: string;
    status?: "succeeded" | "processing";
    redirect_status?: string;
    payment_intent?: string;
  } => ({
    tipId: typeof search.tipId === "string" ? search.tipId : "",
    status:
      search.status === "succeeded"
        ? "succeeded"
        : search.status === "processing"
          ? "processing"
          : undefined,
    redirect_status:
      typeof search.redirect_status === "string" ? search.redirect_status : undefined,
    payment_intent: typeof search.payment_intent === "string" ? search.payment_intent : undefined,
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

// "/staff/qr" 店ごとのQR 発行画面。?m= でどの所属（membership）のQRかを指定する
const staffQrRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/qr",
  component: StaffQrPage,
  // 表示対象の membership ID（未指定なら最初の所属を使う）
  validateSearch: (search: Record<string, unknown>): { m?: string } => ({
    m: typeof search.m === "string" ? search.m : undefined,
  }),
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

// "/staff/joined" 参加完了画面。?store= 店名・?status= 結果区分（joined / already）を受け取る
const staffJoinedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/staff/joined",
  component: StaffJoinCompletePage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { store: string; status: "joined" | "already" } => ({
    store: typeof search.store === "string" ? search.store : "",
    status: search.status === "already" ? "already" : "joined",
  }),
});

// "/invite/$code" 招待受け入れ画面（招待コードは URL パラメータ）
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite/$code",
  component: StaffInviteAcceptPage,
});

// "/store" 店入口（認証ゲート。ログイン/導入セットアップ/ホームを内部で出し分ける）
const storeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store",
  component: StorePage,
});

// "/store/login" 店ログイン画面（直接アクセス用）
const storeLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/login",
  component: StoreLoginPage,
});

// "/store/approval" 導入・承認画面（pending→approved）
const storeApprovalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/approval",
  component: StoreApprovalPage,
});

// "/store/staff" スタッフ一覧（在籍管理）。?tab=invited で招待中タブを初期表示できる
const storeStaffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/staff",
  component: StoreStaffPage,
  // 初期タブ（在籍中=active / 招待中=invited）。それ以外は active 扱い
  validateSearch: (search: Record<string, unknown>): { tab?: "active" | "invited" } => ({
    tab: search.tab === "invited" ? "invited" : search.tab === "active" ? "active" : undefined,
  }),
});

// "/store/invites/new" スタッフ招待（リンク発行）
const storeInviteCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/invites/new",
  component: StoreInviteCreatePage,
});

// "/store/invites/$code" 招待リンクの再コピー画面（招待者名・リンク・コピー・取り消し）
const storeInviteResendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/invites/$code",
  component: StoreInviteResendPage,
});

// "/store/gratitude" 感謝の可視化（件数・お客さまの声・スタッフ別件数。金額なし）
const storeGratitudeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/gratitude",
  component: StoreGratitudePage,
});

// "/store/settings" 設定
const storeSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/settings",
  component: StoreSettingsPage,
});

// "/store/profile" 店舗プロフィール編集
const storeProfileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/store/profile",
  component: StoreProfilePage,
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
  staffJoinedRoute,
  inviteRoute,
  storeRoute,
  storeLoginRoute,
  storeApprovalRoute,
  storeStaffRoute,
  storeInviteCreateRoute,
  storeInviteResendRoute,
  storeGratitudeRoute,
  storeSettingsRoute,
  storeProfileRoute,
]);

export const router = createRouter({ routeTree });

// 型安全なルーティングのための型登録
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
