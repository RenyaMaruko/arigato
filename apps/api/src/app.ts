import { Hono } from "hono";
import { cors } from "hono/cors";

// 各 feature の Route ファクトリ（feature 同士は直接 import せず、ここでだけ集約する）
import { createHealthRoute } from "./features/health/health.route.js";
import { createTipRoute } from "./features/tip/tip.route.js";
import { createStaffRoute } from "./features/staff/staff.route.js";
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
import { resolvePayoutAvailability } from "./features/staff/staff.service.js";
import { resolveApproval } from "./features/store/store.service.js";

// 外部 API（Stripe）は infrastructure に隔離。feature ではなく、ここ（コンポジションルート）で
// 配線して feature の Service へコールバック注入する。feature から infrastructure を直接 import しない。
import { createDirectChargeSession } from "./infrastructure/stripe/stripe-connect.js";
import { verifyWebhookEvent } from "./infrastructure/stripe/stripe-webhook.js";

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

  // 決済後にお客さまを戻すフロントの URL を組み立てる（環境変数 WEB_BASE_URL、未設定はローカル）。
  // 完了画面は succeeded を Webhook 確定後に表示するため、tipId をクエリで渡す。
  const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:5173";
  const buildReturnUrls = (staffId: string, tipId: string) => ({
    successUrl: `${webBaseUrl}/tip/${staffId}/complete?tipId=${tipId}`,
    cancelUrl: `${webBaseUrl}/tip/${staffId}`,
  });

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
  const staffRoute = createStaffRoute({ resolvePayoutAvailability });
  const storeRoute = createStoreRoute({ resolveApproval });

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
        event,
      ),
  });

  // ルートをマウント（型を保ったままチェーンし、Hono RPC で型を引けるようにする）
  const routes = app
    .route("/health", healthRoute)
    .route("/tip", tipRoute)
    .route("/staff", staffRoute)
    .route("/store", storeRoute)
    .route("/webhooks", webhookRoute);

  return routes;
}

// アプリ全体の型（Hono RPC クライアントがフロントで import する）
export type AppType = ReturnType<typeof createApp>;
