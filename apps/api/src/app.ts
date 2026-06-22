import { Hono } from "hono";
import { cors } from "hono/cors";

// 各 feature の Route ファクトリ（feature 同士は直接 import せず、ここでだけ集約する）
import { createHealthRoute } from "./features/health/health.route.js";
import { createTipRoute } from "./features/tip/tip.route.js";
import {
  createStaffRoute,
  createInviteRoute,
} from "./features/staff/staff.route.js";
import { createStoreRoute } from "./features/store/store.route.js";
import { createWebhookRoute } from "./features/webhook/webhook.route.js";

// 各 feature の Service（ユースケース）。Route へ注入してコンポジションルートで配線する。
import { checkHealth } from "./features/health/health.service.js";
import {
  getStaffDisplayInfo,
  createTipIntent,
  getTipComplete,
} from "./features/tip/tip.service.js";
import { createTipRepository } from "./features/tip/tip.repository.js";
import { createInMemoryTipRepository } from "./features/tip/tip.repository.memory.js";
import { handleStripeWebhook } from "./features/webhook/webhook.service.js";
import { createWebhookRepository } from "./features/webhook/webhook.repository.js";
import { createInMemoryWebhookRepository } from "./features/webhook/webhook.repository.memory.js";
import {
  getInviteInfo,
  getStaffMe,
  createStaffProfile,
  updateStaffProfile,
  getStaffTips,
  getStaffBalance,
  getStaffTaxReport,
  startConnectOnboarding,
  applyConnectAccountUpdate,
} from "./features/staff/staff.service.js";
import { createStaffRepository } from "./features/staff/staff.repository.js";
import { createInMemoryStaffRepository } from "./features/staff/staff.repository.memory.js";
import { buildTipUrl } from "./features/staff/staff.model.js";
import {
  getMyStore,
  claimStore,
  getStore,
  approveStore,
  updateStore,
  createStoreInvite,
  listStoreInvites,
  listStoreStaff,
  getStoreGratitude,
} from "./features/store/store.service.js";
import { createStoreRepository } from "./features/store/store.repository.js";
import { createInMemoryStoreRepository } from "./features/store/store.repository.memory.js";
import { buildInviteUrl } from "./features/store/store.model.js";

// 認証ミドルウェア（JWKS 検証は infrastructure に隔離。配線はここで行う）
import { createAuthMiddleware } from "./middleware/auth.js";

// 外部 API（Stripe）は infrastructure に隔離。feature ではなく、ここ（コンポジションルート）で
// 配線して feature の Service へコールバック注入する。feature から infrastructure を直接 import しない。
import {
  createDirectChargeSession,
  createConnectOnboardingLink,
} from "./infrastructure/stripe/stripe-connect.js";
import { verifyWebhookEvent } from "./infrastructure/stripe/stripe-webhook.js";
// Supabase JWT の検証（JWKS / 非対称鍵）は infrastructure/auth に隔離する
import { verifySupabaseJwt } from "./infrastructure/auth/supabase-jwt.js";

/**
 * コンポジションルート。
 * ここで各 feature の Service を Route に注入（依存配線）し、ルートをマウントする。
 * feature 同士・feature と infrastructure は直接 import せず、依存はすべてこの app.ts を通して接続する。
 */
export function createApp() {
  const app = new Hono();

  // フロント（apps/web）からのクロスオリジン呼び出しを許可
  app.use("*", cors());

  // 各 Repository を生成し、Service へ部分適用で配線する。
  // DATABASE_URL があれば実 DB 実装、無ければインメモリ実装にフォールバックする
  // （DB 接続が無い環境でもお客さま投げ銭フローを一通り通すため。差し替えは 4 層分離に従う）。
  const useDb = Boolean(process.env.DATABASE_URL);
  const tipRepo = useDb ? createTipRepository() : createInMemoryTipRepository();
  const webhookRepo = useDb
    ? createWebhookRepository()
    : createInMemoryWebhookRepository();
  const staffRepo = useDb
    ? createStaffRepository()
    : createInMemoryStaffRepository();
  const storeRepo = useDb
    ? createStoreRepository()
    : createInMemoryStoreRepository();

  // フロントのベース URL（WEB_BASE_URL、未設定はローカル）。決済戻り先と QR用URL の組み立てに使う。
  const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:5173";

  // 決済後にお客さまを戻すフロントの URL を組み立てる。
  // 完了画面は succeeded を Webhook 確定後に表示するため、tipId をクエリで渡す。
  const buildReturnUrls = (staffId: string, tipId: string) => ({
    successUrl: `${webBaseUrl}/tip/${staffId}/complete?tipId=${tipId}`,
    cancelUrl: `${webBaseUrl}/tip/${staffId}`,
  });

  // QR用URL（/tip/:staffId）の組み立てに使うフロントのベース URL（QR が指す固定 URL）
  const buildStaffTipUrl = (staffId: string) => buildTipUrl(webBaseUrl, staffId);

  // スタッフ招待リンク（/invite/:code）の組み立てに使うフロントのベース URL
  const buildStoreInviteUrl = (code: string) => buildInviteUrl(webBaseUrl, code);

  // Connect オンボーディングの戻り先 URL を組み立てる。
  // 完了後は本人確認完了画面へ、中断・期限切れ時は残高ステータス画面へ戻す（完了の正は Webhook）。
  const buildOnboardingUrls = () => ({
    returnUrl: `${webBaseUrl}/staff/identity/complete`,
    refreshUrl: `${webBaseUrl}/staff/balance`,
  });

  // Supabase JWT 検証ミドルウェア（JWKS）。infrastructure の verifier を注入して配線する
  const authMiddleware = createAuthMiddleware((token) => verifySupabaseJwt(token));

  // 各 feature の Service を注入してルーターを構築
  const healthRoute = createHealthRoute({ checkHealth });
  const tipRoute = createTipRoute({
    getStaffDisplayInfo: (staffId) => getStaffDisplayInfo(tipRepo, staffId),
    // Stripe Direct charge（infrastructure）を Service へ注入。feature は Stripe SDK を直接知らない。
    createTipIntent: (staffId, input) =>
      createTipIntent(
        tipRepo,
        { createDirectCharge: createDirectChargeSession, buildReturnUrls },
        staffId,
        input,
      ),
    getTipComplete: (staffId, tipId) => getTipComplete(tipRepo, staffId, tipId),
  });
  // staff（認証必須・本人スコープ）。認証ミドルウェアと本人スコープのユースケースを注入する。
  const staffRoute = createStaffRoute({
    authMiddleware,
    getStaffMe: (authUserId) => getStaffMe(staffRepo, buildStaffTipUrl, authUserId),
    createStaffProfile: (authUserId, input) =>
      createStaffProfile(staffRepo, buildStaffTipUrl, authUserId, input),
    updateStaffProfile: (authUserId, input) =>
      updateStaffProfile(staffRepo, buildStaffTipUrl, authUserId, input),
    // 受取履歴・保留残高・申告 CSV は本人スコープのユースケースを注入する
    getStaffTips: (authUserId) => getStaffTips(staffRepo, authUserId),
    getStaffBalance: (authUserId) => getStaffBalance(staffRepo, authUserId),
    getStaffTaxReport: (authUserId, year) => getStaffTaxReport(staffRepo, authUserId, year),
    // Connect オンボーディング（infrastructure のリンク発行を注入。feature は Stripe SDK を直接知らない）
    startConnectOnboarding: (authUserId) =>
      startConnectOnboarding(
        staffRepo,
        createConnectOnboardingLink,
        buildOnboardingUrls,
        authUserId,
      ),
  });
  // 招待検証（認証不要）。店員さんのアカウント作成画面で所属先を表示するために使う。
  const inviteRoute = createInviteRoute({
    getInviteInfo: (code) => getInviteInfo(staffRepo, code),
  });
  // store（認証必須・店スコープ）。承認・招待・スタッフ一覧・感謝の可視化のユースケースを注入する。
  // 店向けの全ユースケースは Service 層で「自店の所有者か」を検証し、金額・残高・着金を一切返さない。
  const storeRoute = createStoreRoute({
    authMiddleware,
    getMyStore: (authUserId) => getMyStore(storeRepo, authUserId),
    claimStore: (authUserId, storeId) => claimStore(storeRepo, authUserId, storeId),
    getStore: (authUserId, storeId) => getStore(storeRepo, authUserId, storeId),
    approveStore: (authUserId, storeId) => approveStore(storeRepo, authUserId, storeId),
    updateStore: (authUserId, storeId, input) =>
      updateStore(storeRepo, authUserId, storeId, input),
    createStoreInvite: (authUserId, storeId) =>
      createStoreInvite(storeRepo, buildStoreInviteUrl, authUserId, storeId),
    listStoreInvites: (authUserId, storeId) =>
      listStoreInvites(storeRepo, buildStoreInviteUrl, authUserId, storeId),
    listStoreStaff: (authUserId, storeId) => listStoreStaff(storeRepo, authUserId, storeId),
    // 感謝の件数集計の基準時刻はサーバーの現在時刻（now）を渡す（Model で JST 判定）
    getStoreGratitude: (authUserId, storeId) =>
      getStoreGratitude(storeRepo, authUserId, storeId, new Date()),
  });

  // Webhook ルートを配線（署名検証＝infrastructure、処理＝webhook Service + tip 更新）。
  const webhookRoute = createWebhookRoute({
    verifyEvent: (rawBody, signature) => verifyWebhookEvent(rawBody, signature),
    handleEvent: (event) =>
      handleStripeWebhook(
        webhookRepo,
        // tip のステータス更新は tip Repository を配線（webhook feature は tip feature を直接 import しない）。
        // ホスト型 Checkout は metadata.tipId で確定（主）、tipId が無い場合は PaymentIntent ID で確定（従）。
        {
          byTipId: (tipId, status, paymentIntentId) =>
            tipRepo.updateTipStatusByTipId(tipId, status, paymentIntentId),
          byPaymentIntentId: (paymentIntentId, status) =>
            tipRepo.updateTipStatusByPaymentIntentId(paymentIntentId, status),
        },
        // account.updated の反映（identity_status verified・held→payable）は staff Service を配線
        // （webhook feature は staff feature を直接 import せず、ここで接続する）。
        (stripeAccountId, payoutsEnabled) =>
          applyConnectAccountUpdate(staffRepo, stripeAccountId, payoutsEnabled),
        event,
      ),
  });

  // ルートをマウント（型を保ったままチェーンし、Hono RPC で型を引けるようにする）
  const routes = app
    .route("/health", healthRoute)
    .route("/tip", tipRoute)
    .route("/staff", staffRoute)
    .route("/invites", inviteRoute)
    .route("/store", storeRoute)
    .route("/webhooks", webhookRoute);

  return routes;
}

// アプリ全体の型（Hono RPC クライアントがフロントで import する）
export type AppType = ReturnType<typeof createApp>;
