import { canPayout, type IdentityStatus } from "./staff.model.js";

/**
 * staff feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * Sprint 1 では着金可否判定の橋渡しのみ。本実装は後続スプリントで拡張する。
 * 「金額は本人のみ閲覧可」等のアクセス制御はこの層で実装していく。
 */

/**
 * 本人確認の状態から着金可能かを返すユースケース。
 */
export function resolvePayoutAvailability(status: IdentityStatus): boolean {
  return canPayout(status);
}
