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

// 着金（精算）ステータス（held: 保留 / payable: 着金可能 / paid: 着金済）
export type SettlementStatus = "held" | "payable" | "paid";

/**
 * 本人確認の状態から着金可否を判定する純粋関数。
 * verified のときだけ着金可能とする。
 */
export function canPayout(status: IdentityStatus): boolean {
  return status === "verified";
}

/**
 * Stripe の account.updated（Connected Account の状態）から本人確認の状態を導く純粋関数。
 * payouts_enabled が true になったら verified（着金可能）。
 * まだなら、まだ未着手（none）でなければ審査中（pending）として扱う。
 * 本人確認は「後ろ倒し」のため、none のまま投げ銭は受け付けており、verified への遷移だけを着金の起点にする。
 */
export function deriveIdentityStatus(
  current: IdentityStatus,
  payoutsEnabled: boolean,
): IdentityStatus {
  // 着金可能になった瞬間に verified へ確定する
  if (payoutsEnabled) return "verified";
  // 一度 verified になったら（取りこぼし再送などで）後退させない
  if (current === "verified") return "verified";
  // オンボーディング進行中は審査中として扱う
  return "pending";
}

/**
 * 本人確認が verified へ遷移したときに、保留中（held）の着金ステータスをどう遷移させるかを返す純粋関数。
 * verified になった時点で held は payable（着金可能）へ。それ以外は据え置き。
 * （payable / paid は再遷移させない＝二重遷移を避ける）
 */
export function nextSettlementOnVerified(current: SettlementStatus): SettlementStatus {
  return current === "held" ? "payable" : current;
}

// 受取履歴1件分（金額集計・CSV 生成に使う最小情報）
export type SettledTip = {
  amount: number;
  settlementStatus: SettlementStatus;
};

// 保留残高サマリの集計結果
export type BalanceSummary = {
  heldAmount: number;
  payableAmount: number;
  paidAmount: number;
};

/**
 * 成立済みの投げ銭から、保留残高（held）・着金可能額（payable）・着金済（paid）の合計を集計する純粋関数。
 * 残高は tip の settlement_status を真実の源泉とし、合算はこの Model で行う（DB アクセスなし）。
 */
export function summarizeBalance(tips: SettledTip[]): BalanceSummary {
  const summary: BalanceSummary = { heldAmount: 0, payableAmount: 0, paidAmount: 0 };
  for (const tip of tips) {
    if (tip.settlementStatus === "held") summary.heldAmount += tip.amount;
    else if (tip.settlementStatus === "payable") summary.payableAmount += tip.amount;
    else if (tip.settlementStatus === "paid") summary.paidAmount += tip.amount;
  }
  return summary;
}

// 申告データ CSV の1行分（受取記録）
export type TaxReportRow = {
  // 受取日（YYYY-MM-DD）
  receivedDate: string;
  // 受取金額（円）
  amount: number;
  // 受取時の店名
  storeName: string;
};

/**
 * CSV の1セルをエスケープする純粋関数。
 * カンマ・ダブルクオート・改行を含む値はダブルクオートで囲み、内部の " は "" に置換する（RFC4180）。
 */
export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 受取記録から申告用 CSV 文字列を組み立てる純粋関数。
 * 少なくとも「受取日 / 金額 / 店名」の列を含む。確定申告に使える素直な形にする。
 * Excel 等での文字化けを避けるため UTF-8 BOM を先頭に付ける。
 */
export function buildTaxReportCsv(rows: TaxReportRow[]): string {
  const header = ["受取日", "金額", "店名"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvCell(row.receivedDate),
        // 金額は数値だが念のためセル化（カンマ無しの整数）
        escapeCsvCell(String(row.amount)),
        escapeCsvCell(row.storeName),
      ].join(","),
    );
  }
  // 行は CRLF で区切る（RFC4180）。先頭に BOM。
  return "﻿" + lines.join("\r\n") + "\r\n";
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
