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
  // payout.* 系の Stripe Payout ID（送金の着金/失敗の照合に使う。該当しないイベントは null）
  payoutId: string | null;
  // payout.* の metadata.payout_id（自前 payout 行の id・照合バックアップ。該当しないイベントは null）
  payoutMetadataId: string | null;
  // payout.paid の着金日時（対象外は null）
  payoutArrivedAt: Date | null;
  // payout.failed の失敗理由（対象外は null）
  payoutFailureReason: string | null;
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
  // payout.* で送金（payout）の状態を更新できたか（該当 payout 無し・冪等スキップなら false）
  payoutUpdated: boolean;
};

/**
 * payout.* （送金の着金確定・失敗）を反映する関数（コンポジションルートで配線）。
 * webhook feature は staff feature を直接 import せず、この注入関数を通して状態更新を行う。
 *  - payout.paid   → status=paid・arrived_at 記録
 *  - payout.failed → status=failed・failure_reason 記録・該当 tip を payable へ戻す
 * 反映できたか（boolean）を返す（既に確定済み・該当 payout 無しなら false）。
 */
export type ApplyPayoutUpdate = (params: {
  // 確定種別（paid / failed）
  kind: "paid" | "failed";
  // 自前 payout を照合する Stripe Payout ID（主の照合キー）
  stripePayoutId: string;
  // metadata.payout_id（自前 payout 行の id・従の照合キー。stripe_payout_id 更新前に落ちても確定できる保険）
  payoutId: string | null;
  // payout.paid の着金日時
  arrivedAt: Date | null;
  // payout.failed の失敗理由
  failureReason: string | null;
}) => Promise<boolean>;

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

// 何も更新しなかったときの結果の素地（冪等記録だけ残した・対象外イベント等）
const NO_OP_RESULT: HandleWebhookResult = {
  received: true,
  duplicate: false,
  tipUpdated: false,
  identityVerified: false,
  promotedTips: 0,
  payoutUpdated: false,
};

/**
 * 署名検証済みの Webhook イベントを処理する。
 * 冪等性を最初に判定し、新規のときだけ状態更新を行う:
 *  - payment_intent.* → tip.status を更新
 *  - account.updated   → 注入された applyAccountUpdate で identity_status / settlement_status を遷移
 *  - payout.paid / payout.failed → 注入された applyPayoutUpdate で送金の着金確定・失敗を反映
 * 同一イベント ID の再送は冪等にスキップし、二重遷移しない。
 */
export async function handleStripeWebhook(
  repo: WebhookRepository,
  updateTip: UpdateTipStatusDeps,
  applyAccountUpdate: ApplyAccountUpdate,
  applyPayoutUpdate: ApplyPayoutUpdate,
  event: VerifiedEvent,
): Promise<HandleWebhookResult> {
  // 冪等性: 同一イベント ID を2回受けても2回目は記録できず false → 何もせずスキップ
  const isNew = await repo.recordEventIfNew(event.id, event.type);
  if (!isNew) {
    return { ...NO_OP_RESULT, duplicate: true };
  }

  // account.updated: 本人確認の遷移（verified）と held→payable の遷移を行う
  if (event.type === "account.updated") {
    // Connected Account ID が無ければ対象なし（冪等記録だけ残す）
    if (!event.accountId) {
      return NO_OP_RESULT;
    }
    const result = await applyAccountUpdate(event.accountId, event.payoutsEnabled === true);
    return {
      ...NO_OP_RESULT,
      identityVerified: result.verified,
      promotedTips: result.promotedTips,
    };
  }

  // payout.paid / payout.failed: 送金の着金確定・失敗を反映する（着金確定は Webhook を正とする）
  if (event.type === "payout.paid" || event.type === "payout.failed") {
    // Stripe Payout ID が無ければ照合できず対象なし（冪等記録だけ残す）
    if (!event.payoutId) {
      return NO_OP_RESULT;
    }
    const updated = await applyPayoutUpdate({
      kind: event.type === "payout.paid" ? "paid" : "failed",
      stripePayoutId: event.payoutId,
      // metadata.payout_id（自前 payout 行の id）。stripe_payout_id 更新前に落ちた場合の照合バックアップ
      payoutId: event.payoutMetadataId,
      arrivedAt: event.payoutArrivedAt,
      failureReason: event.payoutFailureReason,
    });
    return { ...NO_OP_RESULT, payoutUpdated: updated };
  }

  // 種別を tip ステータスへ写像（対象外イベントはここで終了。冪等記録だけ残す）
  const nextStatus = EVENT_TO_TIP_STATUS[event.type];
  if (!nextStatus) {
    return NO_OP_RESULT;
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
  return { ...NO_OP_RESULT, tipUpdated: updated > 0 };
}
