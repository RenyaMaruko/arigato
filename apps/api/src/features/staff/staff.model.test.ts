import { describe, it, expect } from "vitest";
import {
  canPayout,
  isInviteUsable,
  buildTipUrl,
  normalizeHeadline,
  deriveIdentityStatus,
  nextSettlementOnVerified,
  summarizeBalance,
  buildTaxReportCsv,
  escapeCsvCell,
} from "./staff.model.js";

/**
 * staff Model（純粋関数）のテスト。
 * 着金可否・招待の有効性・QR用URL組み立て・一言の正規化・本人確認の遷移・保留残高集計・CSV を検証する。
 */
describe("staff.model", () => {
  it("canPayout は verified のときだけ true", () => {
    expect(canPayout("verified")).toBe(true);
    expect(canPayout("pending")).toBe(false);
    expect(canPayout("none")).toBe(false);
  });

  it("deriveIdentityStatus: payouts_enabled=true で verified に遷移する", () => {
    expect(deriveIdentityStatus("none", true)).toBe("verified");
    expect(deriveIdentityStatus("pending", true)).toBe("verified");
    // まだ着金可能でなければ審査中（pending）扱い
    expect(deriveIdentityStatus("none", false)).toBe("pending");
    expect(deriveIdentityStatus("pending", false)).toBe("pending");
    // 一度 verified になったら後退させない（取りこぼし再送対策）
    expect(deriveIdentityStatus("verified", false)).toBe("verified");
  });

  it("nextSettlementOnVerified: held のみ payable へ。payable / paid は据え置き（二重遷移しない）", () => {
    expect(nextSettlementOnVerified("held")).toBe("payable");
    expect(nextSettlementOnVerified("payable")).toBe("payable");
    expect(nextSettlementOnVerified("paid")).toBe("paid");
  });

  it("summarizeBalance: settlement 別に金額を合算する（保留 / 着金可能 / 着金済）", () => {
    const summary = summarizeBalance([
      { amount: 300, settlementStatus: "held" },
      { amount: 500, settlementStatus: "held" },
      { amount: 100, settlementStatus: "payable" },
      { amount: 1000, settlementStatus: "paid" },
    ]);
    expect(summary.heldAmount).toBe(800);
    expect(summary.payableAmount).toBe(100);
    expect(summary.paidAmount).toBe(1000);
  });

  it("summarizeBalance: 空配列はすべて 0", () => {
    expect(summarizeBalance([])).toEqual({
      heldAmount: 0,
      payableAmount: 0,
      paidAmount: 0,
    });
  });

  it("escapeCsvCell: カンマ・改行・ダブルクオートを含む値は囲み、内部の \" は \"\" にする", () => {
    expect(escapeCsvCell("カフェ Arigato")).toBe("カフェ Arigato");
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("buildTaxReportCsv: 受取日 / 金額 / 店名 の列を含み、行を持つ", () => {
    const csv = buildTaxReportCsv([
      { receivedDate: "2025-05-15", amount: 300, storeName: "カフェ Arigato" },
      { receivedDate: "2025-05-14", amount: 100, storeName: "居酒屋, 花" },
    ]);
    // ヘッダに3列がある
    expect(csv).toContain("受取日,金額,店名");
    // 受取記録の行が含まれる
    expect(csv).toContain("2025-05-15,300,カフェ Arigato");
    // カンマを含む店名はクオートで囲まれる
    expect(csv).toContain('2025-05-14,100,"居酒屋, 花"');
  });

  it("isInviteUsable は pending かつ店が導入承認に同意済みのときだけ true", () => {
    expect(isInviteUsable("pending", true)).toBe(true);
    // 店が導入承認に同意していなければ使えない（店承認を招待で担保）
    expect(isInviteUsable("pending", false)).toBe(false);
    // 招待が消費済み・失効なら使えない
    expect(isInviteUsable("accepted", true)).toBe(false);
    expect(isInviteUsable("revoked", true)).toBe(false);
  });

  it("buildTipUrl は /tip/:staffId の固定 URL を作る", () => {
    expect(buildTipUrl("https://app.example.com", "abc")).toBe(
      "https://app.example.com/tip/abc",
    );
    // 末尾スラッシュは正規化する
    expect(buildTipUrl("https://app.example.com/", "abc")).toBe(
      "https://app.example.com/tip/abc",
    );
  });

  it("normalizeHeadline は空白のみ・undefined を null に正規化する", () => {
    expect(normalizeHeadline(undefined)).toBeNull();
    expect(normalizeHeadline("   ")).toBeNull();
    expect(normalizeHeadline("  カフェ店員  ")).toBe("カフェ店員");
  });
});
