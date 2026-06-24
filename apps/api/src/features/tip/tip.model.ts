import { PLATFORM_FEE_RATE, STAFF_TAKE_RATE } from "@arigato/shared";
import type { IdentityStatus, SettlementStatus } from "@arigato/shared";

/**
 * tip feature の Model 層（純粋関数・金額計算）。
 * DB アクセスを持たず、投げ銭の金額計算・着金状態の判定ルールのみを記述する。Vitest のテスト対象。
 *
 * 料率モデル（手取り型）:
 *  - お客さまは額面（amount）を「ぴったり」支払う（上乗せなし）。`customer_total = amount`。
 *  - 手数料合計15%（決済料 + 運営手数料）を店員側から差し引き、店員手取りは約85%。
 *  - 運営手数料（application_fee）＝ 額面 ×（15% − Stripe決済料3.6%）≈ 11.4%。
 *    Direct charge では Stripe 料が店員側から引かれるため、運営の取り分をこの率に抑えることで
 *    店員手取り約85%（＝ 額面 − Stripe料 − 運営手数料）を成立させる。
 *  - 例: ¥1,000 → お客さま ¥1,000 / Stripe 約 ¥36 / 運営 約 ¥114 / 店員 ¥850。
 *
 * 端数方針（1か所に集約）:
 *  - 運営手数料（platformFee）は円未満を切り上げ（Math.ceil）＝運営が取りこぼさない。
 *  - 店員手取り（staffAmount）は円未満を切り捨て（Math.floor）＝店員に過剰計上しない。
 *  - これにより customer_total(=amount) − Stripe料 − platformFee ≒ staffAmount（約85%）で整合する。
 */

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
 * 額面 ×（15% − Stripe決済料3.6%）≈ 11.4% を運営手数料とし、円未満は切り上げる（運営が取りこぼさない）。
 * これが Stripe の application_fee_amount になる。
 */
export function calculatePlatformFee(amount: number): number {
  return Math.ceil(amount * PLATFORM_FEE_RATE);
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
    // 運営手数料（application_fee ≈ 11.4%）
    platformFee: calculatePlatformFee(amount),
    // お客さま支払額（上乗せ廃止のため額面と一致）
    customerTotal: calculateCustomerTotal(amount),
  };
}
