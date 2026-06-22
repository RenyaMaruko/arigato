import { isApproved, type StoreStatus } from "./store.model.js";

/**
 * store feature の Service 層（ユースケースの指揮者・アクセス制御）。
 * 店向け経路には金額・残高・着金を一切持たせない（横断ルール: 店はお金に触れない）。
 * Sprint 1 では承認判定の橋渡しのみ。本実装は後続スプリントで拡張する。
 */

/**
 * 店が承認済みかを返すユースケース。
 */
export function resolveApproval(status: StoreStatus): boolean {
  return isApproved(status);
}
