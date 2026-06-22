/**
 * staff feature の Model 層（純粋関数）。
 * 着金可否判定に加え、Sprint 4 で「招待が有効か」「QR用URLの組み立て」などの
 * 業務ルールを純粋関数として持つ。DB アクセスはしない。
 */

// 本人確認の状態（none: 未着手 / pending: 審査中 / verified: 着金可能）
export type IdentityStatus = "none" | "pending" | "verified";

// 招待のステータス（pending: 未消費 / accepted: 消費済み / revoked: 失効）
export type InviteStatus = "pending" | "accepted" | "revoked";

// 店の導入ステータス（pending: 承認待ち / approved: 承認済み）
export type StoreStatus = "pending" | "approved";

/**
 * 本人確認の状態から着金可否を判定する純粋関数。
 * verified のときだけ着金可能とする。
 */
export function canPayout(status: IdentityStatus): boolean {
  return status === "verified";
}

/**
 * 招待が「今すぐ所属確定に使えるか」を判定する純粋関数。
 * 招待が未消費（pending）かつ、発行元の店が承認済み（approved）のときのみ有効。
 * これにより「店承認」を招待で自然に担保する。
 */
export function isInviteUsable(inviteStatus: InviteStatus, storeStatus: StoreStatus): boolean {
  return inviteStatus === "pending" && storeStatus === "approved";
}

/**
 * staff.id から QR が指す固定 URL（/tip/:staffId）を組み立てる純粋関数。
 * QR は別テーブルを持たず staff.id を指す URL として発行し、一度発行したら不変。
 */
export function buildTipUrl(webBaseUrl: string, staffId: string): string {
  // 末尾スラッシュを除いて結合する
  const base = webBaseUrl.replace(/\/$/, "");
  return `${base}/tip/${staffId}`;
}

/**
 * 空文字・空白のみの一言を未入力（null）に正規化する純粋関数。
 * 任意項目を保存前に整える。
 */
export function normalizeHeadline(headline: string | undefined): string | null {
  if (headline == null) return null;
  const trimmed = headline.trim();
  return trimmed === "" ? null : trimmed;
}
