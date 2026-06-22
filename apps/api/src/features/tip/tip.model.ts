import { PLATFORM_FEE_RATE } from "@arigato/shared";
import type { IdentityStatus, SettlementStatus } from "@arigato/shared";

/**
 * tip feature の Model 層（純粋関数・金額計算）。
 * DB アクセスを持たず、投げ銭の金額計算・着金状態の判定ルールのみを記述する。Vitest のテスト対象。
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
 * 手数料率を投げ銭額（満額）に掛け、円未満は切り上げる。
 */
export function calculatePlatformFee(amount: number): number {
  return Math.ceil(amount * PLATFORM_FEE_RATE);
}

/**
 * お客さま支払額を計算する。
 * 投げ銭額（満額）に手数料を上乗せする＝店員さんからは引かず満額が届く。
 */
export function calculateCustomerTotal(amount: number): number {
  return amount + calculatePlatformFee(amount);
}

/**
 * 店員さんに届く満額を返す。
 * 上乗せ方式のため、入力の投げ銭額がそのまま届く。
 */
export function calculateStaffAmount(amount: number): number {
  return amount;
}

/**
 * 投げ銭額から金額3点（店員満額・運営手数料・お客さま支払額）をまとめて算出する純粋関数。
 * Service はこれを使って tip の各金額カラムを構成する。
 */
export function buildTipAmounts(amount: number): {
  amount: number;
  platformFee: number;
  customerTotal: number;
} {
  return {
    amount: calculateStaffAmount(amount),
    platformFee: calculatePlatformFee(amount),
    customerTotal: calculateCustomerTotal(amount),
  };
}
