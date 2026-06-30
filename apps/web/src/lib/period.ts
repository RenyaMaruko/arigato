/**
 * 期間プリセット（すべて／今月／先月／今年）から API に渡す from/to（ISO 文字列）を計算する純粋ロジック。
 * 受取履歴・感謝の記録など、期間で絞る画面で共有する。
 * 計算は純粋関数に切り出し（now を引数で受ける）、UI から独立して単体テストできるようにする。
 *
 * staff 側（features/staff/lib/tipsFilters.ts）と同じ発想だが、feature をまたいで import しないため
 * 共有場所（lib）に置く。store の記録画面はここを使う。
 */

// 期間プリセット。all は期間フィルタ無し。
export type Period = "all" | "thisMonth" | "lastMonth" | "thisYear";

// 期間プリセットの一覧（セレクタの並び順に合わせる）
export const PERIODS: Period[] = ["all", "thisMonth", "lastMonth", "thisYear"];

// 期間から導く受取日時の範囲。from は含む（>=）、to は排他（<）。
// 未指定（フィルタ無し）の端は undefined。
export type PeriodRange = {
  from?: string;
  to?: string;
};

/**
 * 期間プリセットから from/to（ISO 文字列）を計算する純粋関数。
 * to は排他（期間末は「翌月／翌年の頭」を渡す）。基準時刻 now を引数で受け取り、テスト可能にする。
 *  - all:       フィルタ無し（from/to なし）
 *  - thisMonth: 今月1日0:00 〜 翌月1日0:00（排他）
 *  - lastMonth: 先月1日0:00 〜 今月1日0:00（排他）
 *  - thisYear:  1/1 0:00 〜 翌年1/1 0:00（排他）
 * 月境界は Date(年, 月, 1) で組み立て、月の繰り上がり（12月→翌年1月）も標準の Date 正規化に任せる。
 */
export function computePeriodRange(period: Period, now: Date = new Date()): PeriodRange {
  // すべて＝期間フィルタ無し
  if (period === "all") {
    return {};
  }

  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11

  // 今月＝今月1日 〜 翌月1日（排他）
  if (period === "thisMonth") {
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  // 先月＝先月1日 〜 今月1日（排他）
  if (period === "lastMonth") {
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString() };
  }

  // 今年＝1/1 〜 翌年1/1（排他）
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year + 1, 0, 1, 0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}
