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
  recordTipChargeSettlement,
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
  joinStore,
  leaveStoreMembership,
  updateStaffProfile,
  uploadStaffAvatar,
  getStaffTips,
  getStaffBalance,
  getStaffTaxReport,
  startConnectOnboarding,
  createConnectAccountSession,
  applyConnectAccountUpdate,
  createStaffPayout,
  getStaffPayouts,
  applyPayoutWebhookUpdate,
  recordPayoutLedger,
  recordSettlementCorrectionLedger,
} from "./features/staff/staff.service.js";
import { createStaffRepository } from "./features/staff/staff.repository.js";
import { createInMemoryStaffRepository } from "./features/staff/staff.repository.memory.js";
import { buildTipUrl } from "./features/staff/staff.model.js";
import {
  getMyStore,
  createStore,
  getStore,
  updateStore,
  createStoreInvite,
  listStoreInvites,
  revokeStoreInvite,
  listStoreStaff,
  getStoreStaffDetail,
  removeStoreStaff,
  getStoreGratitude,
  uploadStoreLogo,
  closeStore,
  transferStoreOwner,
  createStoreAdminInvite,
  listStoreAdmins,
  removeStoreAdmin,
  leaveStoreAsOwner,
} from "./features/store/store.service.js";
import { createStoreRepository } from "./features/store/store.repository.js";
import { createInMemoryStoreRepository } from "./features/store/store.repository.memory.js";
import { buildInviteUrl } from "./features/store/store.model.js";

// 認証ミドルウェア（JWKS 検証は infrastructure に隔離。配線はここで行う）
import { createAuthMiddleware } from "./middleware/auth.js";

// 外部 API（Stripe）は infrastructure に隔離。feature ではなく、ここ（コンポジションルート）で
// 配線して feature の Service へコールバック注入する。feature から infrastructure を直接 import しない。
import {
  createDirectChargePaymentIntent,
  createConnectOnboardingLink,
  createAccountSession,
  createPayout,
  createConnectedAccount,
  retrieveConnectBalance,
  retrieveChargeSettlement,
  listPayoutLedgerEntries,
} from "./infrastructure/stripe/stripe-connect.js";
import { verifyWebhookEvent } from "./infrastructure/stripe/stripe-webhook.js";
// Supabase JWT の検証（JWKS / 非対称鍵）は infrastructure/auth に隔離する
import { verifySupabaseJwt } from "./infrastructure/auth/supabase-jwt.js";
// Supabase Storage（公開バケットへの画像アップロード）も infrastructure に隔離する
import { uploadPublicImage } from "./infrastructure/supabase/supabase-storage.js";

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

  // フロントのベース URL（WEB_BASE_URL、未設定はローカル）。QR用URL・Connect 戻り先の組み立てに使う。
  const webBaseUrl = process.env.WEB_BASE_URL ?? "http://localhost:5173";

  // QR用URL（/tip/:membershipId）の組み立てに使うフロントのベース URL（QR が指す固定 URL）。
  // QR は所属（membership＝人×店）単位で発行するため、membershipId を受ける。
  const buildStaffTipUrl = (membershipId: string) => buildTipUrl(webBaseUrl, membershipId);

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
    // Stripe Direct charge の PaymentIntent 作成（infrastructure）を Service へ注入。
    // feature は Stripe SDK を直接知らない。フロントは返る client_secret でアプリ内に決済 UI を埋め込む。
    createTipIntent: (staffId, input) =>
      createTipIntent(
        tipRepo,
        { createDirectCharge: createDirectChargePaymentIntent },
        staffId,
        input,
      ),
    getTipComplete: (staffId, tipId) => getTipComplete(tipRepo, staffId, tipId),
  });
  // staff（認証必須・本人スコープ）。認証ミドルウェアと本人スコープのユースケースを注入する。
  const staffRoute = createStaffRoute({
    authMiddleware,
    getStaffMe: (authUserId) => getStaffMe(staffRepo, buildStaffTipUrl, authUserId),
    // プロフィール作成時に連結アカウントを自動作成（charges 前倒し・payouts は本人確認後）。
    // feature は Stripe SDK を直接知らない。infrastructure の createConnectedAccount を注入する。
    createStaffProfile: (authUserId, input) =>
      createStaffProfile(staffRepo, buildStaffTipUrl, createConnectedAccount, authUserId, input),
    // 招待コードで所属（staff_store）を追加する（参加の確定点。新規/既存/再参加を問わず）
    joinStore: (authUserId, inviteCode) =>
      joinStore(staffRepo, buildStaffTipUrl, authUserId, inviteCode),
    // 自分でその店を脱退する（論理削除・本人スコープ）。脱退後の最新 StaffMe を返す
    leaveStoreMembership: (authUserId, membershipId) =>
      leaveStoreMembership(staffRepo, buildStaffTipUrl, authUserId, membershipId),
    updateStaffProfile: (authUserId, input) =>
      updateStaffProfile(staffRepo, buildStaffTipUrl, authUserId, input),
    // アバター画像のアップロード。Supabase Storage（infrastructure）へ保存し avatar_url を更新する。
    // feature は Supabase を直接知らず、infrastructure の uploadPublicImage を注入する。
    uploadStaffAvatar: (authUserId, file) =>
      uploadStaffAvatar(staffRepo, uploadPublicImage, authUserId, file),
    // 受取履歴・保留残高・申告 CSV は本人スコープのユースケースを注入する
    // 受取履歴は20件ずつのキーセットページング。cursor/limit を Service へ渡す（合計は全件の別集計）
    getStaffTips: (authUserId, query) => getStaffTips(staffRepo, authUserId, query),
    // 残高3段（送金できる＝Stripe available / 準備中 pending / 本人確認待ち held）。
    // 送金可能額の正は Stripe の実 available。infrastructure の残高取得を注入する（feature は Stripe を直接知らない）。
    getStaffBalance: (authUserId) =>
      getStaffBalance(staffRepo, retrieveConnectBalance, authUserId),
    getStaffTaxReport: (authUserId, year) => getStaffTaxReport(staffRepo, authUserId, year),
    // Connect オンボーディング（infrastructure のリンク発行を注入。feature は Stripe SDK を直接知らない）
    startConnectOnboarding: (authUserId) =>
      startConnectOnboarding(
        staffRepo,
        createConnectOnboardingLink,
        buildOnboardingUrls,
        authUserId,
      ),
    // 埋め込み型オンボーディング（Connect Embedded Components）用の Account Session 発行。
    // Connected Account を保証（無ければ自動作成）→ infrastructure の createAccountSession で
    // account_onboarding を有効にした session を発行し client_secret を返す。
    // feature は Stripe SDK を直接知らない（infrastructure の関数を注入する）。
    createConnectAccountSession: (authUserId) =>
      createConnectAccountSession(
        staffRepo,
        createConnectedAccount,
        createAccountSession,
        authUserId,
      ),
    // 送金（振込申請）。Stripe payout（infrastructure）を注入。送金可能額・送金額は Stripe の実 available を正とし、
    // available に収まる範囲の payable 分だけを銀行へ（残高不足の構造的回避＝#5）。
    // verified必須・最低額・available 上限の選定ロジックは Service（Model）に集約する。
    // 申請時点の available 再取得（TOCTOU 回避）のため retrieveConnectBalance も注入する。
    createStaffPayout: (authUserId) =>
      createStaffPayout(staffRepo, createPayout, retrieveConnectBalance, authUserId),
    // 送金履歴（本人のみ）
    getStaffPayouts: (authUserId) => getStaffPayouts(staffRepo, authUserId),
  });
  // 招待検証（認証不要）。店員さんのアカウント作成画面で所属先を表示するために使う。
  const inviteRoute = createInviteRoute({
    getInviteInfo: (code) => getInviteInfo(staffRepo, code),
  });
  // store（認証必須・店スコープ）。店舗作成・招待・スタッフ一覧・感謝の可視化のユースケースを注入する。
  // 店向けの全ユースケースは Service 層で「自店の所有者か」を検証し、金額・残高・着金を一切返さない。
  const storeRoute = createStoreRoute({
    authMiddleware,
    getMyStore: (authUserId) => getMyStore(storeRepo, authUserId),
    createStore: (authUserId, input) => createStore(storeRepo, authUserId, input),
    getStore: (authUserId, storeId) => getStore(storeRepo, authUserId, storeId),
    updateStore: (authUserId, storeId, input) =>
      updateStore(storeRepo, authUserId, storeId, input),
    // 店ロゴ画像のアップロード。Supabase Storage（infrastructure）へ保存し logo_url を更新する。
    uploadStoreLogo: (authUserId, storeId, file) =>
      uploadStoreLogo(storeRepo, uploadPublicImage, authUserId, storeId, file),
    createStoreInvite: (authUserId, storeId, input) =>
      createStoreInvite(storeRepo, buildStoreInviteUrl, authUserId, storeId, input),
    listStoreInvites: (authUserId, storeId) =>
      listStoreInvites(storeRepo, buildStoreInviteUrl, authUserId, storeId),
    revokeStoreInvite: (authUserId, storeId, code) =>
      revokeStoreInvite(storeRepo, authUserId, storeId, code),
    listStoreStaff: (authUserId, storeId) => listStoreStaff(storeRepo, authUserId, storeId),
    // 在籍中スタッフ1人の詳細（基本情報・金額なし・店スコープ）
    getStoreStaffDetail: (authUserId, storeId, staffId) =>
      getStoreStaffDetail(storeRepo, authUserId, storeId, staffId),
    // 自店のスタッフを在籍解除する（論理削除・店スコープ）。お金は移動しない
    removeStoreStaff: (authUserId, storeId, staffId) =>
      removeStoreStaff(storeRepo, authUserId, storeId, staffId),
    // 感謝の集計の基準時刻はサーバーの現在時刻（now）を渡す。period（from/to）は記録画面の期間セレクタ由来
    getStoreGratitude: (authUserId, storeId, period) =>
      getStoreGratitude(storeRepo, authUserId, storeId, new Date(), period),
    // 店を論理削除（閉店）する（owner のみ）。QR・所属を無効化し履歴・資金は保全する
    closeStore: (authUserId, storeId) => closeStore(storeRepo, authUserId, storeId),
    // owner を譲渡する（owner のみ）。active な admin へ引き継ぐ
    transferStoreOwner: (authUserId, storeId, targetAuthUserId) =>
      transferStoreOwner(storeRepo, authUserId, storeId, targetAuthUserId),
    // 管理者一覧（owner/admin・店の管理モード。金額なし）。閲覧者のロールも返す
    listStoreAdmins: (authUserId, storeId) => listStoreAdmins(storeRepo, authUserId, storeId),
    // 管理者招待の発行（owner のみ・リンク発行）。受け入れで store_admin role=admin を作る
    createStoreAdminInvite: (authUserId, storeId, input) =>
      createStoreAdminInvite(storeRepo, buildStoreInviteUrl, authUserId, storeId, input),
    // 管理者を外す（owner のみ・論理削除）。owner は外せない（譲渡か閉店を使う）
    removeStoreAdmin: (authUserId, storeId, targetAuthUserId) =>
      removeStoreAdmin(storeRepo, authUserId, storeId, targetAuthUserId),
    // owner が店から抜ける（owner のみ）。残る管理者がいれば自動昇格・いなければ閉店
    leaveStoreAsOwner: (authUserId, storeId) => leaveStoreAsOwner(storeRepo, authUserId, storeId),
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
        // payout.paid / payout.failed の反映（着金確定・失敗で tip を payable へ戻す）も staff Service を配線
        (params) => applyPayoutWebhookUpdate(staffRepo, params),
        // (c)(d)(f) の追加ユースケースを配線（webhook feature は tip / staff feature を直接 import せず、ここで接続する）。
        {
          // (c) 受取 tip の確定見込みを tip へ鏡保存（infra で charge を expand し balance_transaction を取得）
          recordTipSettlementMirror: (p) =>
            recordTipChargeSettlement(tipRepo, retrieveChargeSettlement, p),
          // (d) payout 内訳（balance_transaction ↔ tip）を照合台帳へ追記（infra で balance_transactions?payout= を取得）
          recordPayoutLedger: (p) =>
            recordPayoutLedger(staffRepo, listPayoutLedgerEntries, p),
          // (f) 返金・チャージバックで tip を refunded / disputed へ遷移し、補正を台帳へ追記する。
          //   tip 側の遷移（tip Repository）と台帳補正（staff Service）を、ここ（コンポジションルート）で束ねる。
          applySettlementCorrection: async (p) => {
            // まず tip を終端状態へ遷移（残高・履歴・送金候補から除外）。冪等（既に終端なら null）。
            const corrected = await tipRepo.applySettlementCorrectionToTip({
              settlementStatus: p.kind,
              chargeId: p.chargeId,
              paymentIntentId: p.paymentIntentId,
            });
            if (!corrected) return false;
            // 遷移できたら補正エントリを不変台帳へ追記する（append-only）
            await recordSettlementCorrectionLedger(staffRepo, {
              kind: p.kind,
              tipId: corrected.tipId,
              faceAmount: corrected.amount,
              stripeChargeId: p.chargeId,
            });
            return true;
          },
        },
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
