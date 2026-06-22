import { describe, it, expect } from "vitest";
import { PLATFORM_FEE_RATE } from "@arigato/shared";
import {
  calculateCustomerTotal,
  calculatePlatformFee,
  calculateStaffAmount,
  buildTipAmounts,
} from "./tip.model.js";

/**
 * 金額計算 Model（純粋関数）のユニットテスト。
 * 定額3種（¥100 / ¥300 / ¥500）について customer_total・platform_fee・staff_amount を検証し、
 * 「手数料はお客さま上乗せ＝店員さんには満額が届く」ことを保証する。
 */

// 手数料率（0.1）から各金額の期待値を算出した期待表。
// platform_fee は円未満切り上げ（Math.ceil）、customer_total = amount + platform_fee。
const cases = [
  { amount: 100, platformFee: 10, customerTotal: 110 },
  { amount: 300, platformFee: 30, customerTotal: 330 },
  { amount: 500, platformFee: 50, customerTotal: 550 },
];

describe("tip.model 金額計算", () => {
  // 前提: 手数料率は 0.1 を真実の源泉とする
  it("PLATFORM_FEE_RATE は 0.1 である", () => {
    expect(PLATFORM_FEE_RATE).toBe(0.1);
  });

  describe.each(cases)("投げ銭 ¥$amount のとき", ({ amount, platformFee, customerTotal }) => {
    it(`platform_fee は ¥${platformFee}`, () => {
      expect(calculatePlatformFee(amount)).toBe(platformFee);
    });

    it(`customer_total は ¥${customerTotal}（amount + 上乗せ手数料）`, () => {
      expect(calculateCustomerTotal(amount)).toBe(customerTotal);
    });

    it(`staff_amount は満額 ¥${amount}（手数料は店員さんから引かれない）`, () => {
      // 店員さんに届く満額は、選択した投げ銭額そのものと一致する
      expect(calculateStaffAmount(amount)).toBe(amount);
    });

    it("お客さま支払額 = 店員さん満額 + 運営手数料 が成り立つ", () => {
      // 上乗せの不変条件: customer_total === staff_amount + platform_fee
      expect(calculateCustomerTotal(amount)).toBe(
        calculateStaffAmount(amount) + calculatePlatformFee(amount),
      );
    });

    it("buildTipAmounts は3点をまとめて正しく返す", () => {
      expect(buildTipAmounts(amount)).toEqual({ amount, platformFee, customerTotal });
    });
  });

  // 円未満が出る金額でも切り上げで整数円になることを確認（手数料の端数処理）
  it("端数が出る金額でも platform_fee は切り上げの整数になる", () => {
    // 333 * 0.1 = 33.3 → 切り上げ 34
    expect(calculatePlatformFee(333)).toBe(34);
    expect(calculateCustomerTotal(333)).toBe(367);
    expect(calculateStaffAmount(333)).toBe(333);
  });
});
