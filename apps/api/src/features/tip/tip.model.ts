import { PLATFORM_FEE_RATE } from "@arigato/shared";

/**
 * tip feature の Model 層（純粋関数・金額計算）。
 * DB アクセスを持たず、投げ銭の金額計算ルールのみを記述する。Vitest のテスト対象。
 * Sprint 1 では基盤として骨格を用意し、本実装（PaymentIntent 連携）は後続スプリントで拡張する。
 */

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
