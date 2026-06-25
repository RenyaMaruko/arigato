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
 * 料率モデル（手取り型・案B：fees.payer=application）を保証する:
 *  - お客さま支払額（customer_total）＝ 額面（amount）。上乗せなし。
 *  - 運営手数料（platform_fee = application_fee）＝ 額面 − 店員手取り（floor(額面×0.85)）＝ 実質 額面の約15%。
 *  - 店員手取り（staff_amount）＝ floor(額面×0.85)（円未満切り捨て）。
 *  - 最重要の不変条件: 店員手取り + 運営手数料 ＝ 額面（1円も取りこぼさない）。
 *    Direct charge では 連結アカウント残高 ＝ 額面 − application_fee なので、これで残高 ＝ 店員手取り が成立する。
 *    Stripe 決済料は運営（fees.payer=application）負担で application_fee から差し引かれる（運営純額 約11.4%）。
 */

// 各定数が手取り型の前提どおりであることを確認するための期待値表。
// staff = floor(amount × 0.85)、platform_fee（application_fee）= amount − staff（= 約15%）。
const cases = [
  // ¥100: staff floor(85)=85 / platform 100−85=15 / customer=100
  { amount: 100, platformFee: 15, staffAmount: 85, customerTotal: 100 },
  // ¥300: staff floor(255)=255 / platform 45
  { amount: 300, platformFee: 45, staffAmount: 255, customerTotal: 300 },
  // ¥500: staff floor(425)=425 / platform 75
  { amount: 500, platformFee: 75, staffAmount: 425, customerTotal: 500 },
  // ¥1,000（仕様例）: staff floor(850)=850 / platform 150 / customer=1000
  { amount: 1000, platformFee: 150, staffAmount: 850, customerTotal: 1000 },
  // ¥5,000: staff floor(4250)=4250 / platform 750
  { amount: 5000, platformFee: 750, staffAmount: 4250, customerTotal: 5000 },
  // ¥5,500（検算例）: staff floor(4675)=4675 / platform 825
  { amount: 5500, platformFee: 825, staffAmount: 4675, customerTotal: 5500 },
  // ¥50,000（上限境界）: staff floor(42500)=42500 / platform 7500
  { amount: 50000, platformFee: 7500, staffAmount: 42500, customerTotal: 50000 },
];

describe("tip.model 金額計算（手取り型・案B）", () => {
  // 前提: 手数料合計15%・Stripe決済料3.6%・店員手取り85%・application_fee率15% を真実の源泉とする
  it("料率定数が手取り型（案B）の前提どおりである", () => {
    expect(TOTAL_FEE_RATE).toBe(0.15);
    expect(STRIPE_FEE_RATE).toBe(0.036);
    expect(STAFF_TAKE_RATE).toBe(0.85);
    // 案B では application_fee 率 = 15%（Stripe 料は運営負担で application_fee から引かれる）
    expect(PLATFORM_FEE_RATE).toBe(0.15);
  });

  describe.each(cases)(
    "投げ銭 ¥$amount のとき",
    ({ amount, platformFee, staffAmount, customerTotal }) => {
      it(`platform_fee（application_fee）は ¥${platformFee}（＝額面−店員手取り・約15%）`, () => {
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

      it("最重要の不変条件: 店員手取り + application_fee ＝ 額面（連結残高＝DB手取りが1円もズレない）", () => {
        // Direct charge では 連結残高 = 額面 − application_fee。これが DB の店員手取りと一致するには
        // 店員手取り + application_fee == 額面 でなければならない。
        expect(calculateStaffAmount(amount) + calculatePlatformFee(amount)).toBe(amount);
      });

      it("buildTipAmounts は amount/platformFee/customerTotal を正しく返す", () => {
        expect(buildTipAmounts(amount)).toEqual({ amount, platformFee, customerTotal });
      });
    },
  );

  // 端数が出る金額でも store 手取りは切り捨て・application_fee は補完で整数になり、合計は額面に一致する
  it("端数が出る金額でも staff=切り捨て・application_fee=補完で合計が額面に一致する", () => {
    // 333 × 0.85 = 283.05 → 切り捨て 283
    expect(calculateStaffAmount(333)).toBe(283);
    // application_fee = 333 − 283 = 50（実質 ceil(333×0.15)=ceil(49.95)=50 と一致）
    expect(calculatePlatformFee(333)).toBe(50);
    // 不変条件: 合計が額面に一致
    expect(calculateStaffAmount(333) + calculatePlatformFee(333)).toBe(333);
    // 上乗せ廃止のため customer_total は額面そのまま
    expect(calculateCustomerTotal(333)).toBe(333);
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
