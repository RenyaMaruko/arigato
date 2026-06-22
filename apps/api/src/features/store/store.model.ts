import { randomBytes } from "node:crypto";

/**
 * store feature の Model 層（純粋関数）。
 * 店はお金に触れないため、残高・着金・金額に関するルールは一切持たない。
 * 承認状態の判定・招待コードの生成・感謝集計の期間判定などの業務ルールを純粋関数で表す。
 * DB アクセスはしない。
 */

// 店の導入ステータス（pending: 承認待ち / approved: 承認済み）
export type StoreStatus = "pending" | "approved";

// 招待ステータス（pending: 招待中 / accepted: 所属確定 / revoked: 失効）
export type StoreInviteStatus = "pending" | "accepted" | "revoked";

/**
 * 店が承認済みかを判定する純粋関数。
 */
export function isApproved(status: StoreStatus): boolean {
  return status === "approved";
}

/**
 * 承認リクエストに対して、次に遷移すべきステータスを返す純粋関数。
 * 承認は pending → approved の一方向のみ。既に approved でも approved に据え置く（冪等）。
 */
export function nextStatusOnApprove(_current: StoreStatus): StoreStatus {
  return "approved";
}

/**
 * スタッフ招待コード（リンク/コード用トークン）を生成する純粋関数。
 * URL セーフな英数字（base64url 由来）でランダム生成し、招待リンク /invite/:code に使う。
 * 推測されにくいよう十分な長さ（22文字相当）を確保する。
 */
export function generateInviteCode(): string {
  // 16バイト（128bit）の乱数を URL セーフな文字列にする
  return randomBytes(16).toString("base64url");
}

/**
 * 店員さんに渡す招待リンク URL（/invite/:code）を組み立てる純粋関数。
 * フロントのベース URL と招待コードから絶対 URL を作る。
 */
export function buildInviteUrl(webBaseUrl: string, code: string): string {
  // 末尾スラッシュを除いて結合する
  const base = webBaseUrl.replace(/\/$/, "");
  return `${base}/invite/${code}`;
}

// 感謝集計の対象期間（件数の集計に使う。金額の集計は一切しない）
export type GratitudePeriods = {
  // 累計件数
  totalCount: number;
  // 今日（JST）の件数
  todayCount: number;
  // 直近7日（今週相当）の件数
  weekCount: number;
  // 今月（暦月・JST）の件数
  monthCount: number;
};

// 感謝集計の入力1件分（成立済み投げ銭の「いつ」だけ。金額は持ち込まない）
export type GratitudeCountInput = {
  // 受け取った日時（ISO 文字列・UTC）
  receivedAt: string;
};

/**
 * 成立済み投げ銭の受取日時の配列から、件数の集計（累計/今日/今週/今月）を行う純粋関数。
 *
 * 金額は引数にも結果にも一切含めない（店はお金に触れない）。
 * 期間は JST（+09:00）基準で判定する。`now` は判定基準時刻（テスト容易性のため引数で受ける）。
 */
export function summarizeGratitudeCounts(
  tips: GratitudeCountInput[],
  now: Date,
): GratitudePeriods {
  // JST のミリ秒オフセット（+9時間）
  const JST_OFFSET = 9 * 60 * 60 * 1000;

  // ある日時を JST の年月日（YYYY-MM-DD 相当の数値キー）に落とす
  const jstDateKey = (d: Date): string => {
    const jst = new Date(d.getTime() + JST_OFFSET);
    // UTC ゲッターで JST 換算後の年月日を取り出す
    const y = jst.getUTCFullYear();
    const m = jst.getUTCMonth();
    const day = jst.getUTCDate();
    return `${y}-${m}-${day}`;
  };

  // 今日（JST）の年月日キー
  const todayKey = jstDateKey(now);
  // 今月（JST）の年と月
  const nowJst = new Date(now.getTime() + JST_OFFSET);
  const curYear = nowJst.getUTCFullYear();
  const curMonth = nowJst.getUTCMonth();
  // 今週（直近7日）の下限時刻
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const periods: GratitudePeriods = {
    totalCount: 0,
    todayCount: 0,
    weekCount: 0,
    monthCount: 0,
  };

  for (const tip of tips) {
    const d = new Date(tip.receivedAt);
    if (Number.isNaN(d.getTime())) continue;

    // 累計
    periods.totalCount += 1;

    // 今日
    if (jstDateKey(d) === todayKey) periods.todayCount += 1;

    // 今週（直近7日）
    if (d.getTime() >= weekAgo) periods.weekCount += 1;

    // 今月（暦月・JST）
    const dJst = new Date(d.getTime() + JST_OFFSET);
    if (dJst.getUTCFullYear() === curYear && dJst.getUTCMonth() === curMonth) {
      periods.monthCount += 1;
    }
  }

  return periods;
}
