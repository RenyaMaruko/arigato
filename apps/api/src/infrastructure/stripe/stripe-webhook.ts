import { getStripe, type Stripe } from "./stripe.client.js";
import type { VerifiedWebhookEvent } from "./stripe.types.js";

/**
 * Stripe Webhook の署名検証（infrastructure 層）。
 *
 * 必須ルール:
 *  - 署名検証は「生の（raw）リクエストボディ」が必要。JSON パース後の値では検証できない。
 *    呼び出し元（Route）は Hono の自動 JSON パースを通さず raw body を渡すこと。
 *  - 署名シークレット（whsec_...）は env から読む。コードに直書きしない。
 *
 * 検証に成功すると、Service が必要とする最小情報（VerifiedWebhookEvent）に整形して返す。
 * feature 層は Stripe SDK の Event 型に直接依存せず、この整形済みの型だけを受け取る。
 *
 * Connect スコープのイベントについて（重要）:
 *  - Direct charge の charge / payout / refund / dispute は **Connected Account 上**で発生するため、
 *    これらは「Connect スコープのイベント」（event.account に連結アカウント ID が入る）として届く。
 *  - ローカル検証では `stripe listen` がプラットフォーム＋Connect 双方のイベントを転送する:
 *      stripe listen --api-key "$STRIPE_SECRET_KEY" \
 *        --forward-to localhost:8787/webhooks/stripe
 *    （payout.* / charge.* / charge.dispute.* / charge.refunded も転送される）。
 *  - 本番では Dashboard の Webhook エンドポイントで **「Connect からのイベントもリッスンする」**を
 *    有効にすること（platform のみだと Connected Account 上の charge/payout/dispute を受け取れない）。
 *  - 署名シークレット（whsec_…）は listen / エンドポイントごとに発行される値を STRIPE_WEBHOOK_SECRET に設定する。
 */

// 署名不正・シークレット未設定を区別するためのエラー（Route が 400 を返す判断に使う）
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * raw body と Stripe-Signature ヘッダから Webhook イベントを検証し、整形して返す。
 * 署名が不正・欠落していれば WebhookVerificationError を投げる（Route 側で 400 系にする）。
 */
export function verifyWebhookEvent(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
): VerifiedWebhookEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new WebhookVerificationError("STRIPE_WEBHOOK_SECRET が未設定です。");
  }
  if (!signatureHeader) {
    throw new WebhookVerificationError("Stripe-Signature ヘッダがありません。");
  }

  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    // 生ボディ・署名・シークレットで検証（改ざん/再送経路の偽装を弾く）
    event = stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch (err) {
    // 署名不一致など。詳細はログに残しつつ、呼び出し元には検証失敗として伝える
    const message = err instanceof Error ? err.message : "署名検証に失敗しました。";
    throw new WebhookVerificationError(message);
  }

  // 対象 PaymentIntent ID と metadata.tipId を抽出する（payment_intent.* 系イベント）
  let paymentIntentId: string | null = null;
  let tipId: string | null = null;
  // account.updated 系の Connected Account ID と着金可否
  let accountId: string | null = null;
  let payoutsEnabled: boolean | null = null;
  // payout.* 系の Stripe Payout ID・metadata.payout_id・着金日時・失敗理由
  let payoutId: string | null = null;
  let payoutMetadataId: string | null = null;
  let payoutArrivedAt: Date | null = null;
  let payoutFailureReason: string | null = null;
  // (c) charge.* / payment_intent.succeeded の charge ID・課金先 Connected Account
  let chargeId: string | null = null;
  let chargeConnectedAccountId: string | null = null;
  // (f) 返金・チャージバックの種別
  let settlementCorrection: "refunded" | "disputed" | null = null;

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    paymentIntentId = pi.id;
    tipId = (pi.metadata?.tipId as string | undefined) ?? null;
    // (c) succeeded 時は latest_charge から charge ID を拾い、確定見込み（balance_transaction）の取得起点にする。
    //   Direct charge は Connected Account 上で発生するため、その口座 ID も拾う（balance_transaction 取得時に必要）。
    if (event.type === "payment_intent.succeeded") {
      chargeId = extractChargeId(pi.latest_charge);
      chargeConnectedAccountId = extractAccountFromEvent(event);
    }
  } else if (
    event.type === "charge.succeeded" ||
    event.type === "charge.updated"
  ) {
    // (c) charge イベント。PI 直後に balance_transaction が未付与でも、後続の charge.updated で埋められる。
    const charge = event.data.object as Stripe.Charge;
    chargeId = charge.id;
    paymentIntentId = extractStringId(charge.payment_intent);
    tipId = (charge.metadata?.tipId as string | undefined) ?? null;
    chargeConnectedAccountId = extractAccountFromEvent(event);
  } else if (event.type === "charge.refunded") {
    // (f) 返金。charge の source(ch_…)/payment_intent から tip を特定して refunded へ遷移させる
    const charge = event.data.object as Stripe.Charge;
    chargeId = charge.id;
    paymentIntentId = extractStringId(charge.payment_intent);
    chargeConnectedAccountId = extractAccountFromEvent(event);
    settlementCorrection = "refunded";
  } else if (
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.funds_withdrawn"
  ) {
    // (f) チャージバック（異議）。dispute.charge / payment_intent から tip を特定して disputed へ遷移させる
    const dispute = event.data.object as Stripe.Dispute;
    chargeId = extractStringId(dispute.charge);
    paymentIntentId = extractStringId(dispute.payment_intent);
    chargeConnectedAccountId = extractAccountFromEvent(event);
    settlementCorrection = "disputed";
  } else if (event.type === "account.updated") {
    // Connected Account のオンボーディング状態変化。payouts_enabled が着金可否の起点。
    const account = event.data.object as Stripe.Account;
    accountId = account.id;
    payoutsEnabled = account.payouts_enabled === true;
  } else if (event.type === "payout.paid" || event.type === "payout.failed") {
    // 送金（payout）の着金確定・失敗。stripe_payout_id を主に、metadata.payout_id を従に照合する。
    const po = event.data.object as Stripe.Payout;
    payoutId = po.id;
    // metadata.payout_id（自前 payout 行の id）。stripe_payout_id 更新前に落ちた場合の照合バックアップ
    payoutMetadataId = (po.metadata?.payout_id as string | undefined) ?? null;
    if (event.type === "payout.paid") {
      // arrival_date は秒単位の epoch。着金日時として記録する
      payoutArrivedAt = po.arrival_date ? new Date(po.arrival_date * 1000) : new Date();
    } else {
      payoutFailureReason = po.failure_message ?? po.failure_code ?? null;
    }
  }

  return {
    id: event.id,
    type: event.type,
    paymentIntentId,
    tipId,
    accountId,
    payoutsEnabled,
    payoutId,
    payoutMetadataId,
    payoutArrivedAt,
    payoutFailureReason,
    chargeId,
    chargeConnectedAccountId,
    settlementCorrection,
  };
}

// charge / payment_intent などが string か展開オブジェクトかに関わらず ID（文字列）を取り出す純粋ヘルパ
function extractStringId(value: string | { id: string } | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value.id ?? null;
}

// PaymentIntent.latest_charge（string | Charge | null）から charge ID を取り出す純粋ヘルパ
function extractChargeId(latestCharge: Stripe.PaymentIntent["latest_charge"]): string | null {
  return extractStringId(latestCharge);
}

// Direct charge の発生元 Connected Account ID をイベントから取り出す。
// Connect スコープのイベントは event.account（連結アカウント）に口座 ID が入る。
function extractAccountFromEvent(event: Stripe.Event): string | null {
  return event.account ?? null;
}
