import { randomBytes } from "node:crypto";

/**
 * store feature の Model 層（純粋関数）。
 * 店はお金に触れないため、残高・着金・金額に関するルールは一切持たない。
 * 招待コードの生成・招待リンクの組み立て・感謝集計の期間判定などの業務ルールを純粋関数で表す。
 *
 * 店はセルフサーブで自分の店舗を作成する（運営の事前発行・claim・承認ゲートは廃止）。
 * 「導入承認」は作成時の同意（adoption_agreed_at）として Service/Repository が記録する。
 * DB アクセスはしない。
 */

// 招待ステータス（pending: 招待中 / accepted: 所属確定 / revoked: 失効）
export type StoreInviteStatus = "pending" | "accepted" | "revoked";

// 招待の種類（staff: スタッフ招待＝在籍・QR / admin: 管理者招待＝store_admin role=admin）
export type StoreInviteType = "staff" | "admin";

// 店舗の管理者ロール（owner: 所有者 / admin: 管理者）
export type StoreRole = "owner" | "admin";

// owner 自動継承の判定に渡す、残っている active な管理者1件（最古参の判定に created_at を使う）
export type SuccessionAdmin = {
  authUserId: string;
  // その店に管理者として加わった日時（ISO 文字列）。小さいほど古参
  createdAt: string;
};

// owner 自動継承の判定結果。
// - promote: 最古参の管理者を owner へ昇格する（authUserId が昇格対象）
// - close:   残る管理者がいないので店を論理削除（閉店）する
export type OwnerSuccessionDecision =
  | { kind: "promote"; authUserId: string }
  | { kind: "close" };

/**
 * owner が抜ける／消えたときの継承先を決める純粋関数（owner ライフサイクルの中核判定）。
 *
 * - 残っている active な管理者（admin）がいれば、最古参（created_at 最小）を owner へ昇格する。
 *   同着（created_at が同値）の場合は authUserId の昇順で決定的に1人を選ぶ（判定を安定させる）。
 * - 誰もいなければ店を論理削除（閉店）する（owner 不在の店を作らないため）。
 *
 * 引数の admins は「現 owner を除いた」残存 active 管理者の集合を渡すこと（呼び出し側で owner を外す）。
 * DB アクセスはしない（判定だけを担い、実際の昇格/閉店は Service が Repository へ委譲する）。
 */
export function decideOwnerSuccession(admins: SuccessionAdmin[]): OwnerSuccessionDecision {
  if (admins.length === 0) {
    // 残る管理者がいない → 店を閉店（論理削除）する
    return { kind: "close" };
  }
  // 最古参（created_at 最小）を選ぶ。同着は authUserId 昇順で決定的に選ぶ
  const oldest = [...admins].sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    if (at !== bt) return at - bt;
    return a.authUserId < b.authUserId ? -1 : a.authUserId > b.authUserId ? 1 : 0;
  })[0]!;
  return { kind: "promote", authUserId: oldest.authUserId };
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

// 感謝集計の結果（件数のみ。金額は一切扱わない）
export type GratitudePeriods = {
  // 期間で絞った件数（from/to 未指定なら全期間の件数＝累計）
  totalCount: number;
  // 今週（直近7日）の件数。期間指定に関わらず常に今週（店ホームの今週バッジ用）
  weekCount: number;
};

// 感謝集計の入力1件分（成立済み投げ銭の「いつ」だけ。金額は持ち込まない）
export type GratitudeCountInput = {
  // 受け取った日時（ISO 文字列・UTC）
  receivedAt: string;
};

// 件数集計の期間レンジ（from は含む・>=、to は排他・<。ISO 文字列。未指定はその端をフィルタしない）
export type GratitudeCountRange = {
  from?: string;
  to?: string;
};

/**
 * 成立済み投げ銭の受取日時の配列から、件数（totalCount / weekCount）を集計する純粋関数。
 *
 * 金額は引数にも結果にも一切含めない（店はお金に触れない）。
 * - totalCount: range（from/to）で絞った件数。range 未指定なら全期間の件数。
 *               from は含む（>=）・to は排他（<）。
 * - weekCount:  range に関わらず常に「今週（直近7日）」の件数（店ホームの今週バッジ用）。
 *
 * `now` は今週判定の基準時刻（テスト容易性のため引数で受ける）。
 */
export function summarizeGratitudeCounts(
  tips: GratitudeCountInput[],
  now: Date,
  range: GratitudeCountRange = {},
): GratitudePeriods {
  // 期間レンジの境界（ミリ秒）。未指定の端は無制限にする
  const fromMs = range.from ? new Date(range.from).getTime() : Number.NEGATIVE_INFINITY;
  const toMs = range.to ? new Date(range.to).getTime() : Number.POSITIVE_INFINITY;
  // 今週（直近7日）の下限時刻
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const periods: GratitudePeriods = {
    totalCount: 0,
    weekCount: 0,
  };

  for (const tip of tips) {
    const d = new Date(tip.receivedAt);
    if (Number.isNaN(d.getTime())) continue;
    const ms = d.getTime();

    // totalCount: 期間レンジ内（from <= t < to）だけ数える
    if (ms >= fromMs && ms < toMs) {
      periods.totalCount += 1;
    }

    // weekCount: 期間レンジに関わらず常に今週（直近7日）
    if (ms >= weekAgo) {
      periods.weekCount += 1;
    }
  }

  return periods;
}

/**
 * 店ロゴの Storage 保存パスを組み立てる純粋関数。
 * 形式は logos/<storeId>/<uuid>.<ext>。storeId 配下に分けて店ごとに管理する。
 * uuid・ext は呼び出し側（Service）が用意して渡す（uuid 生成は副作用のため Model では行わない）。
 */
export function buildLogoStoragePath(storeId: string, uuid: string, ext: string): string {
  return `logos/${storeId}/${uuid}.${ext}`;
}
