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
  // イベントの発生元 Connected Account ID（Connect スコープのイベントで event.account に入る）。
  // tip 更新・鏡保存・補正の「帰属口座検証」に使う（多層防御）。account が無いイベントは null
  eventAccountId: string | null;
  paymentIntentId: string | null;
  tipId: string | null;
  // account.updated 系の Connected Account ID（該当しないイベントは null）
  accountId: string | null;
  // Connected Account の payouts_enabled（着金可否の起点。account.updated 以外は null）
  payoutsEnabled: boolean | null;
  // requirements.errors の件数（審査NG・書類不備の明示エラー。account.updated 以外は null）
  requirementsErrorCount: number | null;
  // requirements.pending_verification の件数（提出済み・Stripe が審査中の項目。account.updated 以外は null）
  requirementsPendingVerificationCount: number | null;
  // requirements.past_due の件数（期限切れの未提出項目。account.updated 以外は null）
  requirementsPastDueCount: number | null;
  // requirements.currently_due の件数（今求められている未提出項目。account.updated 以外は null）
  requirementsCurrentlyDueCount: number | null;
  // payout.* 系の Stripe Payout ID（送金の着金/失敗の照合に使う。該当しないイベントは null）
  payoutId: string | null;
  // payout.* の metadata.payout_id（自前 payout 行の id・照合バックアップ。該当しないイベントは null）
  payoutMetadataId: string | null;
  // payout.paid の着金日時（対象外は null）
  payoutArrivedAt: Date | null;
  // payout.failed の失敗理由（対象外は null）
  payoutFailureReason: string | null;
  // (c) charge.* / payment_intent.succeeded の charge ID（ch_…）。確定見込みの取得起点。対象外は null
  chargeId: string | null;
  // (c) charge の発生元 Connected Account ID（Direct charge は連結アカウント上）。対象外は null
  chargeConnectedAccountId: string | null;
  // (f) 返金・チャージバックの種別（refunded / disputed。対象外は null）
  settlementCorrection: "refunded" | "disputed" | null;
};

/**
 * tip のステータスを確定する関数群（コンポジションルートで tip repo を配線）。
 * ホスト型 Checkout の Direct charge では PaymentIntent がお客さまの支払い時に作られるため、
 * 作成直後の tip には PaymentIntent ID が無いことが多い。Stripe の payment_intent.* イベントには
 * metadata.tipId を載せてあるので、tipId による確定を主、PaymentIntent ID による確定を従とする。
 */
export type UpdateTipStatusDeps = {
  // tip ID で確定し、判明した PaymentIntent ID も記録する（主経路）。更新件数を返す。
  // eventAccountId（イベントの発生元 Connected Account）が非 null のときは
  // 「tip の店員の口座と一致する場合だけ」更新する（帰属口座検証・多層防御）。
  byTipId: (
    tipId: string,
    status: TipStatus,
    paymentIntentId: string | null,
    eventAccountId: string | null,
  ) => Promise<number>;
  // PaymentIntent ID で確定する（tipId が無いイベント向けの従経路）。更新件数を返す。
  // eventAccountId の帰属口座検証は byTipId と同じ。
  byPaymentIntentId: (
    paymentIntentId: string,
    status: TipStatus,
    eventAccountId: string | null,
  ) => Promise<number>;
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
  // (c) charge / balance_transaction の確定見込みを tip に保存できたか
  settlementMirrored: boolean;
  // (d) payout 内訳を照合台帳へ追記した件数
  ledgerEntries: number;
  // (f) 返金・チャージバックで tip を refunded / disputed へ遷移できたか
  settlementCorrected: boolean;
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
 * (c) 受取 tip の確定見込み（charge / balance_transaction）を tip に保存する関数（コンポジションルートで配線）。
 * webhook feature は tip feature を直接 import せず、この注入関数を通して保存する。
 *  - payment_intent.succeeded / charge.succeeded / charge.updated 受信時に呼ぶ。
 *  - 内部で charge を expand して balance_transaction（available_on / status）を取得し、対応 tip へ鏡として保存する。
 *  - PI 直後は balance_transaction 未付与のことがあるため、取れなければ後続イベントで埋め直せるよう堅牢に扱う。
 * 保存できたか（boolean）を返す（該当 tip 無し・charge 情報無しなら false）。
 */
export type RecordTipSettlementMirror = (params: {
  // tip 特定の主キー（metadata.tipId 由来。無ければ PaymentIntent ID で引く）
  tipId: string | null;
  // tip 特定の従キー（PaymentIntent ID）
  paymentIntentId: string | null;
  // 確定見込みの取得元 charge ID（ch_…）
  chargeId: string;
  // charge の発生元 Connected Account ID（balance_transaction 取得時に必要）
  connectedAccountId: string;
}) => Promise<boolean>;

/**
 * (d) 送金成立時に payout 内訳（balance_transaction ↔ tip）を照合台帳へ追記する関数（コンポジションルートで配線）。
 * webhook feature は staff feature を直接 import せず、この注入関数を通して追記する。
 *  - payout.paid 受信時に呼ぶ。balance_transactions?payout=po_… を取得し、source(ch_…) から tip を逆引きして
 *    payout ⇄ balance_transaction ⇄ tip の対応を append-only で台帳に記録する（手動送金の唯一の突き合わせ手段）。
 * 追記件数を返す（該当 payout 無し・既に記録済みなら 0）。
 */
export type RecordPayoutLedger = (params: {
  // 主の照合キー（Stripe Payout ID）
  stripePayoutId: string;
  // 従の照合キー（metadata.payout_id＝自前 payout 行 id）
  payoutId: string | null;
}) => Promise<number>;

/**
 * (f) 返金・チャージバックを反映する関数（コンポジションルートで配線）。
 * webhook feature は staff feature を直接 import せず、この注入関数を通して遷移する。
 *  - charge.refunded → tip を refunded、charge.dispute.created/funds_withdrawn → tip を disputed へ遷移。
 *  - 返金/異議の tip は残高・受取履歴・送金候補から除外（settlement_status を終端状態にする）。
 *  - 補正エントリを台帳(d)へ追記する（append-only）。
 * 反映できたか（boolean）を返す（該当 tip 無しなら false）。
 */
export type ApplySettlementCorrection = (params: {
  kind: "refunded" | "disputed";
  // tip 特定の主キー（charge ID から逆引き）
  chargeId: string | null;
  // tip 特定の従キー（PaymentIntent ID）
  paymentIntentId: string | null;
  // イベントの発生元 Connected Account（帰属口座検証。非 null なら tip の店員の口座と一致必須）
  connectedAccountId: string | null;
}) => Promise<boolean>;

/**
 * account.updated から抽出した Connected Account の状態（ApplyAccountUpdate へ渡す入力）。
 * webhook feature は staff feature を直接 import しないため、構造的に同じ型をここで定義する
 * （staff Model の ConnectAccountState と互換。配線はコンポジションルートで行う）。
 */
export type AccountUpdateState = {
  // 送金（payout）が有効になったか（本人確認完了の確定シグナル・最優先）
  payoutsEnabled: boolean;
  // requirements.errors の件数（審査NG・書類不備の明示エラー）
  requirementsErrorCount: number;
  // requirements.pending_verification の件数（提出済み・Stripe が審査中の項目）
  pendingVerificationCount: number;
  // requirements.past_due の件数（期限切れの未提出項目）
  pastDueCount: number;
  // requirements.currently_due の件数（今求められている未提出項目）
  currentlyDueCount: number;
};

/**
 * account.updated（Connected Account の状態変化）を本人確認・着金へ反映する関数（コンポジションルートで配線）。
 * webhook feature は staff feature を直接 import せず、この注入関数を通して遷移を行う。
 * payouts_enabled=true で identity_status を verified に確定し、held の tip を payable へ遷移する。
 * requirements（errors / past_due / currently_due）から要対応（action_required）・審査中（pending）も反映する。
 */
export type ApplyAccountUpdate = (
  stripeAccountId: string,
  account: AccountUpdateState,
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
  settlementMirrored: false,
  ledgerEntries: 0,
  settlementCorrected: false,
};

/**
 * 署名検証済みの Webhook イベントを処理する。
 * 冪等性を最初に判定し、処理対象（新規 or 前回失敗で未処理の既存）のときだけ状態更新を行う:
 *  - payment_intent.* → tip.status を更新
 *  - account.updated   → 注入された applyAccountUpdate で identity_status / settlement_status を遷移
 *  - payout.paid / payout.failed → 注入された applyPayoutUpdate で送金の着金確定・失敗を反映
 * 「処理済み（processed_at）」の再送は冪等にスキップし、二重遷移しない。
 *
 * 受信記録と業務処理は同一トランザクションにできないため、業務処理の成功後に
 * markEventProcessed で処理済みを刻む。業務処理が失敗（throw）した場合は処理済みにせず
 * 例外を伝播させる（Route が 500 を返し、Stripe の再送で再処理される＝イベントの恒久ロスト防止）。
 * 各業務処理は再実行に耐える冪等ガード（pending 限定更新・ON CONFLICT・NOT EXISTS 等）を持つ。
 */
// (c)(d)(f) の追加ユースケースを注入する束（既存4引数は維持しつつ、新規はこの1引数に集約）。
// webhook feature は tip / staff feature を直接 import せず、すべて app.ts でこれらを配線する。
export type SettlementDeps = {
  // (c) 受取 tip の確定見込み（charge / balance_transaction）を tip へ保存する
  recordTipSettlementMirror: RecordTipSettlementMirror;
  // (d) payout 内訳（balance_transaction ↔ tip）を照合台帳へ追記する
  recordPayoutLedger: RecordPayoutLedger;
  // (f) 返金・チャージバックで tip を refunded / disputed へ遷移し、補正を台帳へ追記する
  applySettlementCorrection: ApplySettlementCorrection;
};

export async function handleStripeWebhook(
  repo: WebhookRepository,
  updateTip: UpdateTipStatusDeps,
  applyAccountUpdate: ApplyAccountUpdate,
  applyPayoutUpdate: ApplyPayoutUpdate,
  settlementDeps: SettlementDeps,
  event: VerifiedEvent,
): Promise<HandleWebhookResult> {
  // 冪等性: 処理済み（processed_at あり）の再送は何もせずスキップする。
  // 「新規」または「受信済みだが前回の業務処理が失敗した未処理の残骸」なら処理を続行する。
  const shouldProcess = await repo.recordEventIfNew(event.id, event.type);
  if (!shouldProcess) {
    return { ...NO_OP_RESULT, duplicate: true };
  }

  // 業務処理を実行する。失敗（throw）した場合は processed_at を刻まずに例外を伝播させる
  // （Route が 500 を返し、Stripe の再送で再処理される。部分書き込みも再処理側の冪等ガードで埋まる）。
  const result = await processVerifiedEvent(
    updateTip,
    applyAccountUpdate,
    applyPayoutUpdate,
    settlementDeps,
    event,
  );

  // 業務処理まで成功したので処理済みを刻む（以降の再送は冪等にスキップされる）
  await repo.markEventProcessed(event.id);
  return result;
}

/**
 * イベント種別ごとの業務処理の本体（冪等判定・処理済みマークは handleStripeWebhook 側で行う）。
 * ここで throw した場合は「未処理」のまま残り、Stripe の再送で再処理される。
 */
async function processVerifiedEvent(
  updateTip: UpdateTipStatusDeps,
  applyAccountUpdate: ApplyAccountUpdate,
  applyPayoutUpdate: ApplyPayoutUpdate,
  settlementDeps: SettlementDeps,
  event: VerifiedEvent,
): Promise<HandleWebhookResult> {
  // (f) charge.refunded / charge.dispute.* : 返金・チャージバックを反映する（残高・履歴・送金候補から除外）。
  //   settlementCorrection が立っているイベントはここで処理する（決済確定の写像より優先）。
  //   イベントの発生元口座（eventAccountId）も渡し、tip の帰属口座と一致する場合だけ遷移させる（多層防御）。
  if (event.settlementCorrection) {
    const corrected = await settlementDeps.applySettlementCorrection({
      kind: event.settlementCorrection,
      chargeId: event.chargeId,
      paymentIntentId: event.paymentIntentId,
      connectedAccountId: event.eventAccountId,
    });
    return { ...NO_OP_RESULT, settlementCorrected: corrected };
  }

  // (c) charge.succeeded / charge.updated : 確定見込み（balance_transaction）を tip へ鏡として保存する。
  //   これらは tip の status は変えない（決済確定は payment_intent.* / 突合を正とする）。
  if (event.type === "charge.succeeded" || event.type === "charge.updated") {
    const mirrored = await mirrorChargeSettlement(settlementDeps, event);
    return { ...NO_OP_RESULT, settlementMirrored: mirrored };
  }

  // account.updated: 本人確認の遷移（verified / action_required / pending）と held→payable の遷移を行う。
  // 審査NG・追加書類・審査中は requirements の中身（errors / pending_verification / past_due / currently_due）で届くため件数ごと渡す。
  if (event.type === "account.updated") {
    // Connected Account ID が無ければ対象なし（冪等記録だけ残す）
    if (!event.accountId) {
      return NO_OP_RESULT;
    }
    const result = await applyAccountUpdate(event.accountId, {
      payoutsEnabled: event.payoutsEnabled === true,
      // 抽出できなかった場合（null）は 0 扱い＝要対応へ誤遷移させない（安全側）
      requirementsErrorCount: event.requirementsErrorCount ?? 0,
      pendingVerificationCount: event.requirementsPendingVerificationCount ?? 0,
      pastDueCount: event.requirementsPastDueCount ?? 0,
      currentlyDueCount: event.requirementsCurrentlyDueCount ?? 0,
    });
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

    // (d) payout.paid: 送金が成立したら内訳（balance_transaction ↔ tip）を照合台帳へ追記する。
    //   手動送金は Stripe が自動照合しないため、ここで append-only に突き合わせを記録する。
    //   台帳追記の失敗は送金確定自体を壊さない（ログのみ。失敗で payoutUpdated を覆さない）。
    let ledgerEntries = 0;
    if (event.type === "payout.paid") {
      try {
        ledgerEntries = await settlementDeps.recordPayoutLedger({
          stripePayoutId: event.payoutId,
          payoutId: event.payoutMetadataId,
        });
      } catch (err) {
        console.error(
          "[webhook.service] payout 照合台帳の追記に失敗しました（送金確定は維持）:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { ...NO_OP_RESULT, payoutUpdated: updated, ledgerEntries };
  }

  // 種別を tip ステータスへ写像（対象外イベントはここで終了。冪等記録だけ残す）
  const nextStatus = EVENT_TO_TIP_STATUS[event.type];
  if (!nextStatus) {
    return NO_OP_RESULT;
  }

  // tip の確定: metadata.tipId があれば tipId で確定（主経路。判明した PaymentIntent ID も記録する）。
  // tipId が無いイベントは PaymentIntent ID で確定（従経路）。どちらも無ければ更新対象なし。
  // イベントの発生元口座（eventAccountId）も渡し、tip の帰属口座と一致する場合だけ更新する（多層防御）。
  let updated = 0;
  if (event.tipId) {
    updated = await updateTip.byTipId(
      event.tipId,
      nextStatus,
      event.paymentIntentId,
      event.eventAccountId,
    );
  } else if (event.paymentIntentId) {
    updated = await updateTip.byPaymentIntentId(
      event.paymentIntentId,
      nextStatus,
      event.eventAccountId,
    );
  }

  // 帰属口座の不一致（別口座のイベントが他人の tip を指した）は 0 行更新＝無視される。
  // 「該当なし・確定済み」でも 0 行になるため断定はできないが、追跡できるようログを1行残す。
  if (updated === 0 && (event.tipId || event.paymentIntentId) && event.eventAccountId) {
    console.warn(
      `[webhook.service] tip 更新0行（該当なし・確定済み・または帰属口座不一致）: event=${event.id} type=${event.type} account=${event.eventAccountId}`,
    );
  }

  // (c) payment_intent.succeeded のとき、charge があれば確定見込み（balance_transaction）を tip へ鏡保存する。
  //   決済確定（tip.status=succeeded）の写像とは別に、available_on / bt_status を保存して送金候補の事前フィルタに使う。
  //   失敗しても決済確定は壊さない（ログのみ。PI 直後に未付与でも後続 charge.updated で埋まる）。
  let settlementMirrored = false;
  if (event.type === "payment_intent.succeeded") {
    settlementMirrored = await mirrorChargeSettlement(settlementDeps, event);
  }

  // 該当 tip が無い（例: CLI trigger の無関係なテストイベント）場合は 0 件で tipUpdated=false
  return { ...NO_OP_RESULT, tipUpdated: updated > 0, settlementMirrored };
}

/**
 * (c) charge / balance_transaction の確定見込みを tip へ鏡保存する内部ヘルパ。
 * charge ID と発生元 Connected Account が揃っているときだけ実行する。
 * 取得失敗は決済確定を壊さないようここで握り、false を返す（後続イベントで埋め直せる）。
 */
async function mirrorChargeSettlement(
  deps: SettlementDeps,
  event: VerifiedEvent,
): Promise<boolean> {
  // charge ID と課金先口座が揃っていなければ確定見込みを取得できない（後続イベントで埋める）
  if (!event.chargeId || !event.chargeConnectedAccountId) {
    return false;
  }
  try {
    return await deps.recordTipSettlementMirror({
      tipId: event.tipId,
      paymentIntentId: event.paymentIntentId,
      chargeId: event.chargeId,
      connectedAccountId: event.chargeConnectedAccountId,
    });
  } catch (err) {
    console.error(
      "[webhook.service] 確定見込み（balance_transaction）の tip 保存に失敗しました（後続イベントで再試行）:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
