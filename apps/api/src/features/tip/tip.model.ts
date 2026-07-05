import { STAFF_TAKE_RATE } from "@arigato/shared";
import type { IdentityStatus, SettlementStatus } from "@arigato/shared";

/**
 * tip feature の Model 層（純粋関数・金額計算）。
 * DB アクセスを持たず、投げ銭の金額計算・着金状態の判定ルールのみを記述する。Vitest のテスト対象。
 *
 * 料率モデル（手取り型・案B：fees.payer=application）:
 *  - お客さまは額面（amount）を「ぴったり」支払う（上乗せなし）。`customer_total = amount`。
 *  - 手数料合計15%を店員側から差し引き、店員手取りは約85%。
 *  - 連結アカウントの controller 制約（requirement_collection=application＋dashboard none）では fees.payer も
 *    application でなければならず、Stripe 決済料（約3.6%）は運営が負担する。
 *    そのため 運営手数料（application_fee）＝ 額面 × 15%。Direct charge では
 *    連結アカウント残高 ＝ 額面 − application_fee なので、これで店員手取りが額面の85%になる。
 *  - 例: ¥1,000 → お客さま ¥1,000 / application_fee ¥150 / 店員 ¥850（運営純額 約¥114・Stripe約¥36 は運営手数料から差引）。
 *
 * 端数方針（DB と Stripe 実残高を1円も食い違わせない・最重要）:
 *  - 店員手取り（staffAmount）は円未満を切り捨て（Math.floor）＝店員に過剰計上しない。
 *  - 運営手数料（platformFee = application_fee_amount）は「額面 − staffAmount」で算出する。
 *    こうすると staffAmount + platformFee が必ず額面に一致するため、
 *    Direct charge の連結アカウント残高（＝ 額面 − application_fee）が DB の staffAmount と1円もズレない。
 *  - 結果として platformFee は実質 ceil(額面×0.15) と等価（額面の約15%）になる。
 */

/**
 * 決済未確定（pending）の tip を「期限切れ」とみなすまでの時間（時間単位）。
 * QR を開いたが決済 UI に到達しなかった・カード入力を途中でやめた等の孤児 pending は
 * この時間を超えたら failed へ確定して掃除する（お金は一切動いていないため安全。
 * 万一決済が遅延確定しても failed→succeeded の救済遷移で復活できる）。
 */
export const PENDING_TIP_EXPIRY_HOURS = 24;

/**
 * pending の tip が期限切れ（作成から PENDING_TIP_EXPIRY_HOURS 時間超）かを判定する純粋関数。
 * 突合ジョブが「古い pending の掃除（failed 化）」の対象を判定するのに使う。
 */
export function isPendingTipExpired(createdAt: Date, now: Date): boolean {
  const expiryMs = PENDING_TIP_EXPIRY_HOURS * 60 * 60 * 1000;
  return now.getTime() - createdAt.getTime() > expiryMs;
}

/**
 * Stripe の PaymentIntent ステータスが「期限切れなら failed へ確定してよい状態」かを判定する純粋関数。
 * requires_payment_method / requires_confirmation / requires_action は「お客さまの操作待ちのまま
 * 放置された」状態で、お金は動いていない（期限切れなら安全に failed 化できる）。
 * processing（銀行系の処理中など）は資金が動いている可能性があるため対象にしない。
 * succeeded / canceled は突合ループの写像（succeeded / failed）側で確定する。
 */
export function shouldExpirePendingIntentStatus(stripeStatus: string): boolean {
  return (
    stripeStatus === "requires_payment_method" ||
    stripeStatus === "requires_confirmation" ||
    stripeStatus === "requires_action"
  );
}

/**
 * 決済が succeeded（成立）した時点での、投げ銭の初期 settlement_status を判定する純粋関数。
 *
 * spec §7「本人確認済の状態で成立した分は succeeded 時に payable から開始」を表す。
 * 送り先店員さんが本人確認済（identity_status = verified）なら着金可能（payable）から開始し、
 * 未verified（none / pending）なら保留残高（held）から開始する。
 * held のままの分は、後で account.updated（本人確認完了）で payable へ昇格する。
 *
 * 決済の確定はブラウザでなく Webhook を正とするため、この判定は succeeded 確定時に使う。
 */
export function initialSettlementStatusOnSucceeded(
  identityStatus: IdentityStatus,
): SettlementStatus {
  return identityStatus === "verified" ? "payable" : "held";
}

/**
 * 運営の取り分（application_fee）を計算する。
 * 「額面 − 店員手取り（floor(額面×0.85)）」で算出する＝実質 額面の約15%（ceil 相当）。
 * Direct charge では 連結アカウント残高 ＝ 額面 − application_fee となるため、こう定義すると
 * 連結残高が DB の店員手取り（staffAmount）と1円もズレない（DB と Stripe 実額の一致を保証）。
 * これが Stripe の application_fee_amount になる。運営の純取り分は Stripe 料を引いた残り（約11.4%）。
 */
export function calculatePlatformFee(amount: number): number {
  return amount - calculateStaffAmount(amount);
}

/**
 * お客さま支払額を計算する。
 * 手取り型では上乗せを廃止したため、額面（amount）をそのまま返す（customer_total = amount）。
 * 後方互換のため関数は残すが、上乗せは0。
 */
export function calculateCustomerTotal(amount: number): number {
  return amount;
}

/**
 * 店員さんの手取り額を計算する。
 * 額面 × 店員手取り率（約85%）。手数料合計15%（決済料込み）を引いた残りで、円未満は切り捨てる
 * （店員に過剰計上しない・運営側で端数を吸収する方針）。
 */
export function calculateStaffAmount(amount: number): number {
  return Math.floor(amount * STAFF_TAKE_RATE);
}

/**
 * 投げ銭額から金額3点（額面・運営手数料・お客さま支払額）をまとめて算出する純粋関数。
 * Service はこれを使って tip の各金額カラムを構成する。
 *
 * 注: `amount` は額面（＝お客さま支払額・DB の amount カラム）。店員手取り（約85%）は
 * calculateStaffAmount で別途算出する（受取履歴・残高で使う）。
 */
export function buildTipAmounts(amount: number): {
  amount: number;
  platformFee: number;
  customerTotal: number;
} {
  return {
    // 額面（お客さまが支払う額・DB の amount カラム）
    amount,
    // 運営手数料（application_fee = 額面 − 店員手取り ＝ 約15%）
    platformFee: calculatePlatformFee(amount),
    // お客さま支払額（上乗せ廃止のため額面と一致）
    customerTotal: calculateCustomerTotal(amount),
  };
}
