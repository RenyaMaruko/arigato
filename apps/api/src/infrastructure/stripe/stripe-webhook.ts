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
  // payout.* 系の Stripe Payout ID・着金日時・失敗理由
  let payoutId: string | null = null;
  let payoutArrivedAt: Date | null = null;
  let payoutFailureReason: string | null = null;

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    paymentIntentId = pi.id;
    tipId = (pi.metadata?.tipId as string | undefined) ?? null;
  } else if (event.type === "account.updated") {
    // Connected Account のオンボーディング状態変化。payouts_enabled が着金可否の起点。
    const account = event.data.object as Stripe.Account;
    accountId = account.id;
    payoutsEnabled = account.payouts_enabled === true;
  } else if (event.type === "payout.paid" || event.type === "payout.failed") {
    // 送金（payout）の着金確定・失敗。stripe_payout_id で自前 payout を照合する。
    const po = event.data.object as Stripe.Payout;
    payoutId = po.id;
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
    payoutArrivedAt,
    payoutFailureReason,
  };
}
