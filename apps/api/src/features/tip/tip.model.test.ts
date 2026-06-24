import { describe, it, expect } from "vitest";
import {
  PLATFORM_FEE_RATE,
  STAFF_TAKE_RATE,
  STRIPE_FEE_RATE,
  TOTAL_FEE_RATE,
} from "@arigato/shared";
import {
  calculateCustomerTotal,
  calculatePlatformFee,
  calculateStaffAmount,
  buildTipAmounts,
  initialSettlementStatusOnSucceeded,
} from "./tip.model.js";

/**
 * 金額計算 Model（純粋関数）のユニットテスト。
 * 料率モデル（手取り型）を保証する:
 *  - お客さま支払額（customer_total）＝ 額面（amount）。上乗せなし。
 *  - 運営手数料（platform_fee）≈ 11.4% ＝ 15% − Stripe決済料3.6%（円未満切り上げ）。
 *  - 店員手取り（staff_amount）≈ 85%（円未満切り捨て）。
 *  - 整合: 額面 − Stripe決済料 − 運営手数料 ≒ 店員手取り。
 */

// 各定数が手取り型の前提どおりであることを確認するための期待値表。
// platform_fee = ceil(amount × (0.15 − 0.036))、staff = floor(amount × 0.85)。
const cases = [
  // ¥100: platform ceil(11.4)=12 / staff floor(85)=85 / customer=100
  { amount: 100, platformFee: 12, staffAmount: 85, customerTotal: 100 },
  // ¥300: platform ceil(34.2)=35 / staff floor(255)=255
  { amount: 300, platformFee: 35, staffAmount: 255, customerTotal: 300 },
  // ¥500: platform ceil(57)=57 / staff floor(425)=425
  { amount: 500, platformFee: 57, staffAmount: 425, customerTotal: 500 },
  // ¥1,000（仕様例）: platform ceil(114)=114 / staff floor(850)=850 / customer=1000
  { amount: 1000, platformFee: 114, staffAmount: 850, customerTotal: 1000 },
  // ¥5,000: platform ceil(570)=570 / staff floor(4250)=4250
  { amount: 5000, platformFee: 570, staffAmount: 4250, customerTotal: 5000 },
  // ¥50,000（上限境界）: platform ceil(5700)=5700 / staff floor(42500)=42500
  { amount: 50000, platformFee: 5700, staffAmount: 42500, customerTotal: 50000 },
];

describe("tip.model 金額計算（手取り型）", () => {
  // 前提: 手数料合計15%・Stripe決済料3.6%・運営手数料≈11.4%・店員手取り85% を真実の源泉とする
  it("料率定数が手取り型の前提どおりである", () => {
    expect(TOTAL_FEE_RATE).toBe(0.15);
    expect(STRIPE_FEE_RATE).toBe(0.036);
    expect(STAFF_TAKE_RATE).toBe(0.85);
    // 運営手数料率 ≈ 0.114（浮動小数の都合で 0.114 近傍。差分を許容して確認）
    expect(PLATFORM_FEE_RATE).toBeCloseTo(0.114, 6);
  });

  describe.each(cases)(
    "投げ銭 ¥$amount のとき",
    ({ amount, platformFee, staffAmount, customerTotal }) => {
      it(`platform_fee は ¥${platformFee}（≈11.4%・切り上げ）`, () => {
        expect(calculatePlatformFee(amount)).toBe(platformFee);
      });

      it(`customer_total は ¥${customerTotal}（額面ぴったり・上乗せなし）`, () => {
        expect(calculateCustomerTotal(amount)).toBe(customerTotal);
        // 上乗せ廃止の不変条件: お客さま支払額 = 額面
        expect(calculateCustomerTotal(amount)).toBe(amount);
      });

      it(`staff_amount は手取り ¥${staffAmount}（≈85%・切り捨て）`, () => {
        expect(calculateStaffAmount(amount)).toBe(staffAmount);
      });

      it("整合: 額面 − Stripe決済料 − 運営手数料 ≒ 店員手取り（端数1円以内）", () => {
        // Stripe 決済料（参考値・四捨五入）
        const stripeFee = Math.round(amount * STRIPE_FEE_RATE);
        const remainder = amount - stripeFee - calculatePlatformFee(amount);
        // 端数方針（platform=ceil / staff=floor）の都合で1円以内のズレを許容する
        expect(Math.abs(remainder - calculateStaffAmount(amount))).toBeLessThanOrEqual(1);
      });

      it("buildTipAmounts は amount/platformFee/customerTotal を正しく返す", () => {
        expect(buildTipAmounts(amount)).toEqual({ amount, platformFee, customerTotal });
      });
    },
  );

  // 端数が出る金額でも運営手数料は切り上げ・店員手取りは切り捨ての整数になる
  it("端数が出る金額でも platform_fee は切り上げ・staff_amount は切り捨ての整数になる", () => {
    // 333 × 0.114 = 37.962 → 切り上げ 38
    expect(calculatePlatformFee(333)).toBe(38);
    // 上乗せ廃止のため customer_total は額面そのまま
    expect(calculateCustomerTotal(333)).toBe(333);
    // 333 × 0.85 = 283.05 → 切り捨て 283
    expect(calculateStaffAmount(333)).toBe(283);
  });
});

describe("tip.model initialSettlementStatusOnSucceeded（succeeded 時の初期着金状態）", () => {
  // spec §7: 本人確認済（verified）で成立した分は payable から開始する
  it("verified なら payable から開始する", () => {
    expect(initialSettlementStatusOnSucceeded("verified")).toBe("payable");
  });

  // 未着手（none）はまだ着金できないため保留（held）から開始する
  it("none なら held から開始する", () => {
    expect(initialSettlementStatusOnSucceeded("none")).toBe("held");
  });

  // 審査中（pending）もまだ着金できないため保留（held）から開始する
  it("pending なら held から開始する", () => {
    expect(initialSettlementStatusOnSucceeded("pending")).toBe("held");
  });
});
