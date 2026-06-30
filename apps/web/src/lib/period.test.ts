import { describe, it, expect } from "vitest";
import { computePeriodRange } from "./period.js";

/**
 * 共有の期間→from/to 変換（純粋関数）のテスト。
 * 感謝の記録・受取履歴など、期間で絞る画面が共通で使う。
 * to は排他（翌月／翌年の頭）であることと、月・年の境界が正しいことを検証する。
 * 基準時刻 now を固定して、ローカルタイムゾーンに依らず「相対関係」を検証する。
 */
describe("computePeriodRange (共有)", () => {
  // 基準: 2026-06-15 12:34（ローカル時刻）。月内の任意の時刻でも月初に丸まることを確認する。
  const now = new Date(2026, 5, 15, 12, 34, 56);

  it("all はフィルタ無し（from/to なし）", () => {
    expect(computePeriodRange("all", now)).toEqual({});
  });

  it("thisMonth は今月1日 0:00 〜 翌月1日 0:00（排他）", () => {
    const r = computePeriodRange("thisMonth", now);
    expect(r.from).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    // from < to（範囲が正しい向き）
    expect(new Date(r.from!).getTime()).toBeLessThan(new Date(r.to!).getTime());
  });

  it("lastMonth は先月1日 0:00 〜 今月1日 0:00（排他）", () => {
    const r = computePeriodRange("lastMonth", now);
    expect(r.from).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
  });

  it("thisYear は 1/1 0:00 〜 翌年 1/1 0:00（排他）", () => {
    const r = computePeriodRange("thisYear", now);
    expect(r.from).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2027, 0, 1, 0, 0, 0, 0).toISOString());
  });

  it("12月のとき thisMonth の to は翌年1月へ繰り上がる（年跨ぎ）", () => {
    const dec = new Date(2026, 11, 20, 9, 0, 0);
    const r = computePeriodRange("thisMonth", dec);
    expect(r.from).toBe(new Date(2026, 11, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2027, 0, 1, 0, 0, 0, 0).toISOString());
  });

  it("1月のとき lastMonth は前年12月へ繰り下がる（年跨ぎ）", () => {
    const jan = new Date(2026, 0, 10, 9, 0, 0);
    const r = computePeriodRange("lastMonth", jan);
    expect(r.from).toBe(new Date(2025, 11, 1, 0, 0, 0, 0).toISOString());
    expect(r.to).toBe(new Date(2026, 0, 1, 0, 0, 0, 0).toISOString());
  });
});
