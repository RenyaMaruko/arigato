import type { TipStatus } from "@arigato/shared";
import type { WebhookRepository } from "./webhook.repository.js";

/**
 * webhook feature の Service 層（ユースケースの指揮者）。
 * 署名検証済みのイベント（infrastructure/stripe で検証）を受け取り、
 *  1. 冪等性: webhook_event に記録済みなら何もしない（重複再送を無視）
 *  2. 種別に応じて tip.status を更新（succeeded / failed）
 * を行う。Stripe SDK・DB へ直接依存せず、検証済みイベントと注入された更新関数だけを使う。
 *
 * 決済の確定はブラウザでなく Webhook を正とする。この Service がその「正」を担う。
 */

// Service が受け取る「署名検証済みイベント」の最小情報（infrastructure 型に対応）
export type VerifiedEvent = {
  id: string;
  type: string;
  paymentIntentId: string | null;
  tipId: string | null;
};

/**
 * tip のステータスを確定する関数群（コンポジションルートで tip repo を配線）。
 * ホスト型 Checkout の Direct charge では PaymentIntent がお客さまの支払い時に作られるため、
 * 作成直後の tip には PaymentIntent ID が無いことが多い。Stripe の payment_intent.* イベントには
 * metadata.tipId を載せてあるので、tipId による確定を主、PaymentIntent ID による確定を従とする。
 */
export type UpdateTipStatusDeps = {
  // tip ID で確定し、判明した PaymentIntent ID も記録する（主経路）。更新件数を返す。
  byTipId: (
    tipId: string,
    status: TipStatus,
    paymentIntentId: string | null,
  ) => Promise<number>;
  // PaymentIntent ID で確定する（tipId が無いイベント向けの従経路）。更新件数を返す。
  byPaymentIntentId: (paymentIntentId: string, status: TipStatus) => Promise<number>;
};

// Webhook 処理の結果（テスト・ログ・レスポンスで利用）
export type HandleWebhookResult = {
  // 受理したか（常に true。署名検証は Route 手前で済んでいる）
  received: true;
  // 冪等スキップ（重複再送）だったか
  duplicate: boolean;
  // tip を更新できたか（対象なし・該当 tip 無しなら false）
  tipUpdated: boolean;
};

// Stripe のイベント種別 → tip のステータスへの対応表
const EVENT_TO_TIP_STATUS: Record<string, TipStatus | undefined> = {
  "payment_intent.succeeded": "succeeded",
  "payment_intent.payment_failed": "failed",
};

/**
 * 署名検証済みの Webhook イベントを処理する。
 * 冪等性を最初に判定し、新規のときだけ tip のステータス更新を行う。
 */
export async function handleStripeWebhook(
  repo: WebhookRepository,
  updateTip: UpdateTipStatusDeps,
  event: VerifiedEvent,
): Promise<HandleWebhookResult> {
  // 冪等性: 同一イベント ID を2回受けても2回目は記録できず false → 何もせずスキップ
  const isNew = await repo.recordEventIfNew(event.id, event.type);
  if (!isNew) {
    return { received: true, duplicate: true, tipUpdated: false };
  }

  // 種別を tip ステータスへ写像（対象外イベントはここで終了。冪等記録だけ残す）
  const nextStatus = EVENT_TO_TIP_STATUS[event.type];
  if (!nextStatus) {
    return { received: true, duplicate: false, tipUpdated: false };
  }

  // tip の確定: metadata.tipId があれば tipId で確定（主経路。判明した PaymentIntent ID も記録する）。
  // tipId が無いイベントは PaymentIntent ID で確定（従経路）。どちらも無ければ更新対象なし。
  let updated = 0;
  if (event.tipId) {
    updated = await updateTip.byTipId(event.tipId, nextStatus, event.paymentIntentId);
  } else if (event.paymentIntentId) {
    updated = await updateTip.byPaymentIntentId(event.paymentIntentId, nextStatus);
  }

  // 該当 tip が無い（例: CLI trigger の無関係なテストイベント）場合は 0 件で tipUpdated=false
  return { received: true, duplicate: false, tipUpdated: updated > 0 };
}
