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
  // account.updated 系の Connected Account ID（該当しないイベントは null）
  accountId: string | null;
  // Connected Account の payouts_enabled（着金可否の起点。account.updated 以外は null）
  payoutsEnabled: boolean | null;
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
  // account.updated で本人確認が verified に確定したか
  identityVerified: boolean;
  // account.updated で held → payable へ遷移した tip の件数
  promotedTips: number;
};

/**
 * account.updated（Connected Account の状態変化）を本人確認・着金へ反映する関数（コンポジションルートで配線）。
 * webhook feature は staff feature を直接 import せず、この注入関数を通して遷移を行う。
 * payouts_enabled=true で identity_status を verified に確定し、held の tip を payable へ遷移する。
 */
export type ApplyAccountUpdate = (
  stripeAccountId: string,
  payoutsEnabled: boolean,
) => Promise<{ found: boolean; verified: boolean; promotedTips: number }>;

// Stripe のイベント種別 → tip のステータスへの対応表
const EVENT_TO_TIP_STATUS: Record<string, TipStatus | undefined> = {
  "payment_intent.succeeded": "succeeded",
  "payment_intent.payment_failed": "failed",
};

/**
 * 署名検証済みの Webhook イベントを処理する。
 * 冪等性を最初に判定し、新規のときだけ状態更新を行う:
 *  - payment_intent.* → tip.status を更新
 *  - account.updated   → 注入された applyAccountUpdate で identity_status / settlement_status を遷移
 * 同一イベント ID の再送は冪等にスキップし、二重遷移しない。
 */
export async function handleStripeWebhook(
  repo: WebhookRepository,
  updateTip: UpdateTipStatusDeps,
  applyAccountUpdate: ApplyAccountUpdate,
  event: VerifiedEvent,
): Promise<HandleWebhookResult> {
  // 冪等性: 同一イベント ID を2回受けても2回目は記録できず false → 何もせずスキップ
  const isNew = await repo.recordEventIfNew(event.id, event.type);
  if (!isNew) {
    return {
      received: true,
      duplicate: true,
      tipUpdated: false,
      identityVerified: false,
      promotedTips: 0,
    };
  }

  // account.updated: 本人確認の遷移（verified）と held→payable の遷移を行う
  if (event.type === "account.updated") {
    // Connected Account ID が無ければ対象なし（冪等記録だけ残す）
    if (!event.accountId) {
      return {
        received: true,
        duplicate: false,
        tipUpdated: false,
        identityVerified: false,
        promotedTips: 0,
      };
    }
    const result = await applyAccountUpdate(event.accountId, event.payoutsEnabled === true);
    return {
      received: true,
      duplicate: false,
      tipUpdated: false,
      identityVerified: result.verified,
      promotedTips: result.promotedTips,
    };
  }

  // 種別を tip ステータスへ写像（対象外イベントはここで終了。冪等記録だけ残す）
  const nextStatus = EVENT_TO_TIP_STATUS[event.type];
  if (!nextStatus) {
    return {
      received: true,
      duplicate: false,
      tipUpdated: false,
      identityVerified: false,
      promotedTips: 0,
    };
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
  return {
    received: true,
    duplicate: false,
    tipUpdated: updated > 0,
    identityVerified: false,
    promotedTips: 0,
  };
}
