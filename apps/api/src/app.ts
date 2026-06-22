import { Hono } from "hono";
import { cors } from "hono/cors";

// 各 feature の Route ファクトリ（feature 同士は直接 import せず、ここでだけ集約する）
import { createHealthRoute } from "./features/health/health.route.js";
import { createTipRoute } from "./features/tip/tip.route.js";
import { createStaffRoute } from "./features/staff/staff.route.js";
import { createStoreRoute } from "./features/store/store.route.js";

// 各 feature の Service（ユースケース）。Route へ注入してコンポジションルートで配線する。
import { checkHealth } from "./features/health/health.service.js";
import {
  getStaffDisplayInfo,
  createTipIntent,
  getTipComplete,
} from "./features/tip/tip.service.js";
import { createTipRepository } from "./features/tip/tip.repository.js";
import { createInMemoryTipRepository } from "./features/tip/tip.repository.memory.js";
import { resolvePayoutAvailability } from "./features/staff/staff.service.js";
import { resolveApproval } from "./features/store/store.service.js";

/**
 * コンポジションルート。
 * ここで各 feature の Service を Route に注入（依存配線）し、ルートをマウントする。
 * feature 同士は直接 import せず、依存はすべてこの app.ts を通して接続する。
 */
export function createApp() {
  const app = new Hono();

  // フロント（apps/web）からのクロスオリジン呼び出しを許可
  app.use("*", cors());

  // tip の Repository を生成し、Service へ部分適用で配線する。
  // これにより Route は Repository を意識せず、Service ユースケースだけに依存する。
  // DATABASE_URL があれば実 DB 実装、無ければインメモリ実装にフォールバックする
  // （DB 接続が無い環境でもお客さま投げ銭フローを一通り通すため。差し替えは 4 層分離に従う）。
  const tipRepo = process.env.DATABASE_URL
    ? createTipRepository()
    : createInMemoryTipRepository();

  // 各 feature の Service を注入してルーターを構築
  const healthRoute = createHealthRoute({ checkHealth });
  const tipRoute = createTipRoute({
    getStaffDisplayInfo: (staffId) => getStaffDisplayInfo(tipRepo, staffId),
    createTipIntent: (staffId, input) => createTipIntent(tipRepo, staffId, input),
    getTipComplete: (staffId, tipId) => getTipComplete(tipRepo, staffId, tipId),
  });
  const staffRoute = createStaffRoute({ resolvePayoutAvailability });
  const storeRoute = createStoreRoute({ resolveApproval });

  // ルートをマウント（型を保ったままチェーンし、Hono RPC で型を引けるようにする）
  const routes = app
    .route("/health", healthRoute)
    .route("/tip", tipRoute)
    .route("/staff", staffRoute)
    .route("/store", storeRoute);

  return routes;
}

// アプリ全体の型（Hono RPC クライアントがフロントで import する）
export type AppType = ReturnType<typeof createApp>;
