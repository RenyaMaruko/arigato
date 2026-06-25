import { STAFF_TAKE_RATE, MIN_PAYOUT_AMOUNT } from "@arigato/shared";

/**
 * staff feature の Model 層（純粋関数）。
 * 着金可否判定に加え、Sprint 4 で「招待が有効か」「QR用URLの組み立て」などの
 * 業務ルールを純粋関数として持つ。DB アクセスはしない。
 *
 * 料率モデル（手取り型）の注意:
 *  - tip.amount は「額面（お客さま支払額）」を表す。店員さんに届くのはこの約85%（手数料15%・決済料込み）。
 *  - 店員さんに見せる金額（受取履歴・残高・申告データ）は、この Model で額面から手取り（約85%）へ変換する。
 *    変換は calculateStaffTakeAmount に集約し、表示・集計の整合を1か所で担保する。
 */

/**
 * 額面（お客さま支払額）から店員さんの手取り額（約85%）を計算する純粋関数。
 * 手数料合計15%（決済料込み）を引いた残りで、円未満は切り捨てる（店員に過剰計上しない）。
 * 受取履歴・残高・申告データなど、店員さんに金額を見せる経路はすべてこれを通す。
 */
export function calculateStaffTakeAmount(faceAmount: number): number {
  return Math.floor(faceAmount * STAFF_TAKE_RATE);
}

// 本人確認の状態（none: 未着手 / pending: 審査中 / verified: 着金可能）
export type IdentityStatus = "none" | "pending" | "verified";

// 招待のステータス（pending: 未消費 / accepted: 消費済み / revoked: 失効）
export type InviteStatus = "pending" | "accepted" | "revoked";

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

// 受取履歴1件分（金額集計・CSV 生成に使う最小情報）。amount は額面（お客さま支払額）。
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
 *
 * 手取り型: tip.amount は額面のため、店員さんに見せる残高は手取り（約85%）に変換してから合算する。
 * 1件ごとに手取りへ変換（floor）して足すことで、受取履歴の各行表示（手取り）と合計が整合する。
 */
export function summarizeBalance(tips: SettledTip[]): BalanceSummary {
  const summary: BalanceSummary = { heldAmount: 0, payableAmount: 0, paidAmount: 0 };
  for (const tip of tips) {
    // 額面 → 店員手取り（約85%）へ変換してから残高に積む
    const take = calculateStaffTakeAmount(tip.amount);
    if (tip.settlementStatus === "held") summary.heldAmount += take;
    else if (tip.settlementStatus === "payable") summary.payableAmount += take;
    else if (tip.settlementStatus === "paid") summary.paidAmount += take;
  }
  return summary;
}

// 申告データ CSV の1行分（受取記録）。amount は額面（お客さま支払額）で受け取り、CSV では手取りへ変換する。
export type TaxReportRow = {
  // 受取日（YYYY-MM-DD）
  receivedDate: string;
  // 受取金額（額面・円）。CSV 出力時に店員手取り（約85%）へ変換する
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
 * 金額は店員さんが実際に受け取る手取り（約85%）で出力する（額面ではなく手取りが申告対象）。
 * Excel 等での文字化けを避けるため UTF-8 BOM を先頭に付ける。
 */
export function buildTaxReportCsv(rows: TaxReportRow[]): string {
  const header = ["受取日", "金額", "店名"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvCell(row.receivedDate),
        // 額面 → 店員手取り（約85%）へ変換してセル化（カンマ無しの整数）
        escapeCsvCell(String(calculateStaffTakeAmount(row.amount))),
        escapeCsvCell(row.storeName),
      ].join(","),
    );
  }
  // 行は CRLF で区切る（RFC4180）。先頭に BOM。
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// 送金（payout）のステータス（pending: 申請中 / paid: 着金済 / failed: 失敗）
export type PayoutStatus = "pending" | "paid" | "failed";

// 送金申請の可否判定の結果区分。
// ok: 申請できる / not_verified: 本人確認・口座登録が未完了 / below_minimum: 着金可能額が最低送金額に満たない
export type PayoutEligibility = "ok" | "not_verified" | "below_minimum";

/**
 * 送金（振込申請）が今できるかを判定する純粋関数。
 * 手動送金（メルカリ型）の業務ルールを1か所に集約する:
 *  - verified（着金可能＝口座登録済）でなければ申請できない（not_verified）。
 *  - 着金可能額（payable な tip の手取り合計）が最低送金額 MIN_PAYOUT_AMOUNT 未満なら申請できない（below_minimum）。
 *    残高0も同様に below_minimum。
 *  - 上記を満たせば全額を送金できる（ok）。送金額は着金可能額の全額（部分送金なし）。
 *
 * payableTakeAmount は payable な tip の「手取り合計（floor(amount×0.85) の総和）」を渡すこと。
 */
export function evaluatePayoutEligibility(
  identityStatus: IdentityStatus,
  payableTakeAmount: number,
): PayoutEligibility {
  // verified でなければ着金できない（本人確認・口座登録が必要）
  if (!canPayout(identityStatus)) return "not_verified";
  // 最低送金額に満たない（残高0を含む）
  if (payableTakeAmount < MIN_PAYOUT_AMOUNT) return "below_minimum";
  return "ok";
}

// 送金対象に選んだ tip と、その手取り合計（＝実際に送金する額）。
export type PayoutSelection = {
  // 送金対象に選んだ tip の id 一覧（paid 化の対象）
  tipIds: string[];
  // 選んだ tip の手取り合計（＝Stripe へ送る payout 額・円）。必ず available 以下になる
  amount: number;
};

// 送金対象 tip 選定に渡す、payable な tip 1件の最小情報（id と額面）。
export type PayableTipForSelection = {
  tipId: string;
  // 額面（お客さま支払額・円）。手取りは calculateStaffTakeAmount で算出する
  amount: number;
};

/**
 * 「Stripe の実 available 残高」を上限に、送金する payable tip を選ぶ純粋関数（#5 の肝）。
 *
 * 送金可能額・送金額は DB の payable 合計ではなく Stripe available を正とするため、
 * payable な tip を古い順（先入れ先出し）に手取り換算で積み、累計が available を超えない範囲だけを
 * 送金対象（paid 化＋payout）に選ぶ。これにより:
 *  - 送金額（手取り合計）は必ず available 以下になる → Stripe で残高不足にならない（構造的回避）。
 *  - 選んだ tip だけを paid にする → paid にした分と実際に送った額が一致する（DB と送金の整合）。
 *  - available に収まらない pending 分の tip は payable のまま残る（次回 available になってから送金）。
 *
 * tips は呼び出し側で受け取り順（古い順）に渡すこと（FIFO で古い受取から送る）。
 */
export function selectPayoutTipsWithinAvailable(
  tips: PayableTipForSelection[],
  availableAmount: number,
): PayoutSelection {
  const tipIds: string[] = [];
  let amount = 0;
  for (const tip of tips) {
    // 額面 → 店員手取り（約85%・floor）。残高・受取履歴の表示と同じ換算で整合させる
    const take = calculateStaffTakeAmount(tip.amount);
    // この tip を足すと available を超えるなら「スキップして次へ」（available 以下に収める）。
    // available は Stripe 側で確定済み(settled)の額。受け取ったばかりで pending の tip は
    // 手取りが大きく available を超えがちだが、それを break で打ち切ると、後ろにある
    // available に収まる小さい tip まで送れなくなる（送金できる額>0 なのに送金不可になるバグ）。
    // なので超過する tip はスキップ(continue)し、available に収まる tip を拾う。
    if (amount + take > availableAmount) {
      continue;
    }
    amount += take;
    tipIds.push(tip.tipId);
  }
  return { tipIds, amount };
}

/**
 * 招待が「今すぐ所属確定に使えるか」を判定する純粋関数。
 * 招待が未消費（pending）かつ、発行元の店が導入承認に同意済み（storeAdopted）のときのみ有効。
 * 店はセルフサーブで作成時に導入承認へ同意するため、これにより「店承認」を招待で自然に担保する。
 */
export function isInviteUsable(inviteStatus: InviteStatus, storeAdopted: boolean): boolean {
  return inviteStatus === "pending" && storeAdopted;
}

/**
 * membership（staff_store.id＝人×店）から QR が指す固定 URL（/tip/:membershipId）を組み立てる純粋関数。
 * QR は店ごと（所属ごと）に別 URL を発行し、一度発行したら不変。
 * お客さま投げ銭画面は membership から staff(人)＋store(店) を解決して表示する。
 */
export function buildTipUrl(webBaseUrl: string, membershipId: string): string {
  // 末尾スラッシュを除いて結合する
  const base = webBaseUrl.replace(/\/$/, "");
  return `${base}/tip/${membershipId}`;
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
