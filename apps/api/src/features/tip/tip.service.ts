import type {
  CreateTipInput,
  StaffDisplayInfo,
  TipComplete,
  TipIntentResult,
} from "@arigato/shared";
import { CURRENCY } from "@arigato/shared";
import { buildTipAmounts } from "./tip.model.js";
import type { TipRepository } from "./tip.repository.js";

/**
 * tip feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Model（金額計算）と Repository（DB）を組み合わせて投げ銭のユースケースを実現する。
 * Repository・外部依存（Stripe）は引数で受け取り（注入）、feature から infrastructure を
 * 直接 import しない（依存はコンポジションルート app.ts で配線する）。
 *
 * Stripe 本接続: Direct charge（店員さんの Connected Account へ直課金）。
 * 決済の確定はブラウザの戻り値ではなく Webhook を正とするため、ここでは tip を pending で記録し、
 * PaymentIntent の client_secret を返す（succeeded への遷移は Webhook 経由で行う）。
 * フロントはこの client_secret でアプリ内に決済 UI（Express Checkout Element ＋ Payment Element）を埋め込む。
 */

/**
 * Direct charge の PaymentIntent 作成を Service に注入する関数の型。
 * 実体は infrastructure/stripe/stripe-connect。Service は Stripe SDK を直接知らない。
 */
export type CreateDirectCharge = (params: {
  connectedAccountId: string;
  amount: number;
  applicationFeeAmount: number;
  customerTotal: number;
  currency: string;
  staffDisplayName: string;
  tipId: string;
}) => Promise<{
  // フロントの Stripe Elements に渡す client_secret（アプリ内決済 UI の初期化に使う）
  clientSecret: string;
  // 作成された PaymentIntent の ID（PaymentIntent 方式では作成時点で必ず確定する）
  paymentIntentId: string;
}>;

/**
 * 投げ銭額からそのまま見積もりを返す純粋ユースケース。
 * Sprint 1 から残している疎通用の薄いラッパ。
 */
export function quoteTip(amount: number) {
  return buildTipAmounts(amount);
}

/**
 * 投げ銭画面の表示情報（顔写真・名前・店名・一言）を取得する。
 * 金額・履歴は返さない（横断ルール: 金額は本人のみ閲覧可）。
 */
export async function getStaffDisplayInfo(
  repo: TipRepository,
  staffId: string,
): Promise<StaffDisplayInfo | null> {
  // staff + store を結合して表示情報を取得
  const row = await repo.findStaffDisplay(staffId);
  if (!row) return null;

  // 表示に必要な項目だけに絞って返す
  return {
    staffId: row.staffId,
    displayName: row.displayName,
    headline: row.headline,
    avatarUrl: row.avatarUrl,
    storeName: row.storeName,
  };
}

// createTipIntent が必要とする依存（コンポジションルートで注入する）
export type CreateTipIntentDeps = {
  // Direct charge の PaymentIntent を作る（infrastructure/stripe を配線）
  createDirectCharge: CreateDirectCharge;
};

// 店員さんが Connected Account 未連携で Direct charge を作れないことを示すエラー
export class StaffNotChargeableError extends Error {
  constructor() {
    super("staff_not_chargeable");
    this.name = "StaffNotChargeableError";
  }
}

/**
 * 投げ銭の作成（Stripe Direct charge）。
 * 金額を Model で計算 → tip を pending で記録 → 店員さんの Connected Account へ Direct charge の
 * PaymentIntent を作成 → tip に PaymentIntent ID を紐付け、client_secret を返す。
 *
 * フロントは返した client_secret と connectedAccountId で、アプリ内に決済 UI
 * （Express Checkout Element ＋ Payment Element）を埋め込んで決済を確定する（リダイレクトしない）。
 *
 * 決済の確定はブラウザの戻り値ではなく Webhook を正とするため、ここでは succeeded にしない
 * （tip は pending のまま。payment_intent.succeeded の Webhook で succeeded へ遷移させる）。
 * 課金タイプは Direct charge のみ。Separate charges and transfers（transfer 経由の着金）は使わない。
 */
export async function createTipIntent(
  repo: TipRepository,
  deps: CreateTipIntentDeps,
  staffId: string,
  input: CreateTipInput,
): Promise<TipIntentResult | null> {
  // 送り先 staff の存在と所属店を確認（送信時点の所属を tip に固定保存するため）
  const staffRow = await repo.findStaffDisplay(staffId);
  if (!staffRow) return null;

  // Connected Account が無いと Direct charge の課金先が存在しない（着金口の準備が未了）
  if (!staffRow.stripeAccountId) {
    throw new StaffNotChargeableError();
  }

  // 金額3点を Model（純粋関数）で算出
  const amounts = buildTipAmounts(input.amount);

  // まず tip を pending で記録する（決済確定は Webhook を正とするため succeeded にしない）。
  // PaymentIntent ID は Direct charge 作成後に後付けする。
  const saved = await repo.insertTip({
    staffId: staffRow.staffId,
    storeId: staffRow.storeId,
    amount: amounts.amount,
    platformFee: amounts.platformFee,
    customerTotal: amounts.customerTotal,
    message: input.message ?? null,
    // 決済はまだ成立していない → pending
    status: "pending",
    // 本人確認前に受けた分は保留残高（held）から開始
    settlementStatus: "held",
    // この時点では PaymentIntent は未作成（Direct charge 作成後に後付けする）
    stripePaymentIntentId: null,
    stripeCheckoutSessionId: null,
  });

  // 店員さんの Connected Account へ Direct charge の PaymentIntent を作成する
  const charge = await deps.createDirectCharge({
    connectedAccountId: staffRow.stripeAccountId,
    amount: amounts.amount,
    applicationFeeAmount: amounts.platformFee,
    customerTotal: amounts.customerTotal,
    currency: CURRENCY,
    staffDisplayName: staffRow.displayName,
    tipId: saved.id,
  });

  // 作成した PaymentIntent ID を tip に紐付ける（突合・Webhook の二重化に使う）。
  // PaymentIntent 方式では作成時点で ID が確定するため、ここで必ず保存できる。
  // Webhook は PaymentIntent の metadata.tipId でも当該 tip を特定できる（突合の二重化）。
  await repo.setTipStripeRefs(saved.id, {
    checkoutSessionId: null,
    paymentIntentId: charge.paymentIntentId,
  });

  return {
    tipId: saved.id,
    status: saved.status,
    amount: saved.amount,
    platformFee: saved.platformFee,
    customerTotal: saved.customerTotal,
    // フロントはこの client_secret と connectedAccountId でアプリ内に決済 UI を埋め込む
    clientSecret: charge.clientSecret,
    connectedAccountId: staffRow.stripeAccountId,
  };
}

/**
 * 完了画面の表示情報を取得する。
 * 当該 tip の送金額・メッセージと、送り先店員さんの名前を再掲する。
 * amount は「当該 tip の送金額のみ」を返す（履歴・合算は返さない）。
 */
export async function getTipComplete(
  repo: TipRepository,
  staffId: string,
  tipId: string,
): Promise<TipComplete | null> {
  // tip を ID で取得
  const tip = await repo.findTipById(tipId);
  if (!tip) return null;

  // URL の staffId と tip の staffId が一致しない場合は取り違えとして拒否する
  if (tip.staffId !== staffId) return null;

  // 送り先店員さんの表示名を取得（誰に送ったかの再掲）
  const staffRow = await repo.findStaffDisplay(staffId);
  if (!staffRow) return null;

  return {
    tipId: tip.id,
    staffDisplayName: staffRow.displayName,
    amount: tip.amount,
    message: tip.message,
    // 完了表示は succeeded 確定後に成立させるため、決済ステータスも返す（Webhook を正とする）
    status: tip.status,
  };
}
