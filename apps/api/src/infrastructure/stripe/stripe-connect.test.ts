import { describe, it, expect } from "vitest";
import {
  groupPendingByAvailableDate,
  reconcilePendingBuckets,
  type PendingTransactionLike,
} from "./stripe-connect.js";

/**
 * 準備中（pending）の balance_transactions を「available_on の暦日ごと（Asia/Tokyo 基準）」に
 * 集計する純粋関数のテスト。暦日でまとめる・同日合算・昇順・空配列・合計一致を検証する。
 * 実 Stripe を叩かずに集計ロジックを担保するのがこのテストの目的（複数日付の pending を
 * 実環境で作るのは難しいため、集計はここで保証する）。
 */

// JST の特定日時（YYYY-MM-DDTHH:mm:ss+09:00）を epoch 秒に直すヘルパ
function jst(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

// テスト用の pending トランザクションを作る（既定は JPY・pending）
function txn(overrides: Partial<PendingTransactionLike>): PendingTransactionLike {
  return {
    status: "pending",
    currency: "jpy",
    amount: 100,
    available_on: jst("2026-07-01T12:00:00+09:00"),
    ...overrides,
  };
}

describe("groupPendingByAvailableDate", () => {
  // 「今」は 2026-06-30 12:00 JST（以降の available_on を未来とみなす）
  const now = jst("2026-06-30T12:00:00+09:00");

  it("対象が無ければ空配列を返す", () => {
    expect(groupPendingByAvailableDate([], now)).toEqual([]);
  });

  it("available_on を暦日（JST）でまとめ、同じ日は合算する", () => {
    const txns = [
      // 7/1 の午前と午後（JST 上は同じ暦日）→ 合算される
      txn({ amount: 100, available_on: jst("2026-07-01T09:00:00+09:00") }),
      txn({ amount: 200, available_on: jst("2026-07-01T23:30:00+09:00") }),
      // 7/3
      txn({ amount: 50, available_on: jst("2026-07-03T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(2);
    // 7/1 は合算 300、7/3 は 50
    expect(buckets[0]!.amount).toBe(300);
    expect(buckets[1]!.amount).toBe(50);
    // availableOn はその日の 0:00（JST）＝ UTC 前日 15:00
    expect(buckets[0]!.availableOn).toBe(new Date(jst("2026-07-01T00:00:00+09:00") * 1000).toISOString());
    expect(buckets[1]!.availableOn).toBe(new Date(jst("2026-07-03T00:00:00+09:00") * 1000).toISOString());
  });

  it("UTC 跨ぎ（JST 0:30）でも JST の暦日でまとまる", () => {
    // JST 7/2 0:30（UTC では 7/1 15:30）→ JST 暦日は 7/2 に入る
    const txns = [
      txn({ amount: 100, available_on: jst("2026-07-02T00:30:00+09:00") }),
      txn({ amount: 100, available_on: jst("2026-07-02T20:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.amount).toBe(200);
    expect(buckets[0]!.availableOn).toBe(new Date(jst("2026-07-02T00:00:00+09:00") * 1000).toISOString());
  });

  it("日付昇順で返す（入力順に依らない）", () => {
    const txns = [
      txn({ amount: 30, available_on: jst("2026-07-05T10:00:00+09:00") }),
      txn({ amount: 10, available_on: jst("2026-07-01T10:00:00+09:00") }),
      txn({ amount: 20, available_on: jst("2026-07-03T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets.map((b) => b.amount)).toEqual([10, 20, 30]);
  });

  it("pending 以外・既に available（過去）・JPY 以外は除外する", () => {
    const txns = [
      // available（pending でない）→ 除外
      txn({ status: "available", amount: 999, available_on: jst("2026-07-01T10:00:00+09:00") }),
      // available_on が過去（now 以前）→ 除外
      txn({ amount: 999, available_on: jst("2026-06-29T10:00:00+09:00") }),
      // JPY 以外 → 除外
      txn({ currency: "usd", amount: 999, available_on: jst("2026-07-01T10:00:00+09:00") }),
      // 有効な pending（残るのはこれだけ）
      txn({ amount: 100, available_on: jst("2026-07-01T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.amount).toBe(100);
  });
});

describe("reconcilePendingBuckets", () => {
  const d1 = { availableOn: "2026-07-01T00:00:00.000Z", amount: 200 };
  const d2 = { availableOn: "2026-07-03T00:00:00.000Z", amount: 100 };

  it("合計が pendingAmount と一致していればそのまま返す", () => {
    const result = reconcilePendingBuckets([d1, d2], 300);
    expect(result).toEqual([d1, d2]);
    expect(result.reduce((s, b) => s + b.amount, 0)).toBe(300);
  });

  it("バケット合計が不足する場合、残差を最早バケットに寄せて合計を一致させる", () => {
    // ページングで 50 取りこぼし → pendingAmount=350 だがバケット合計=300
    const result = reconcilePendingBuckets([d1, d2], 350);
    // 残差 50 を先頭（最早）へ寄せる
    expect(result[0]!.amount).toBe(250);
    expect(result[1]!.amount).toBe(100);
    expect(result.reduce((s, b) => s + b.amount, 0)).toBe(350);
  });

  it("バケットが空なら寄せ先が無く空配列のまま（UI 側の保険表示に委ねる）", () => {
    expect(reconcilePendingBuckets([], 300)).toEqual([]);
  });

  it("元の配列を破壊しない（イミュータブル）", () => {
    const input = [{ ...d1 }, { ...d2 }];
    reconcilePendingBuckets(input, 350);
    expect(input[0]!.amount).toBe(200);
  });
});
