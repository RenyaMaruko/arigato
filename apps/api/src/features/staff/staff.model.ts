/**
 * staff feature の Model 層（純粋関数）。
 * Sprint 1 では着金可否判定の骨格のみ。本実装は後続スプリントで拡張する。
 */

// 本人確認の状態（none: 未着手 / pending: 審査中 / verified: 着金可能）
export type IdentityStatus = "none" | "pending" | "verified";

/**
 * 本人確認の状態から着金可否を判定する純粋関数。
 * verified のときだけ着金可能とする。
 */
export function canPayout(status: IdentityStatus): boolean {
  return status === "verified";
}
