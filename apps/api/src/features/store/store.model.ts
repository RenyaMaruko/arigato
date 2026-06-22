/**
 * store feature の Model 層（純粋関数）。
 * 店はお金に触れないため、残高・着金・金額に関するルールは持たない。
 * Sprint 1 では承認状態の判定骨格のみ。本実装は後続スプリントで拡張する。
 */

// 店の導入ステータス
export type StoreStatus = "pending" | "approved";

/**
 * 店が承認済みかを判定する純粋関数。
 */
export function isApproved(status: StoreStatus): boolean {
  return status === "approved";
}
