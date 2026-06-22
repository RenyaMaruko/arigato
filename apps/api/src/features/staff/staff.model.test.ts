import { describe, it, expect } from "vitest";
import {
  canPayout,
  isInviteUsable,
  buildTipUrl,
  normalizeHeadline,
} from "./staff.model.js";

/**
 * staff Model（純粋関数）のテスト。
 * 着金可否・招待の有効性・QR用URL組み立て・一言の正規化を検証する。
 */
describe("staff.model", () => {
  it("canPayout は verified のときだけ true", () => {
    expect(canPayout("verified")).toBe(true);
    expect(canPayout("pending")).toBe(false);
    expect(canPayout("none")).toBe(false);
  });

  it("isInviteUsable は pending かつ店 approved のときだけ true", () => {
    expect(isInviteUsable("pending", "approved")).toBe(true);
    // 店が未承認なら使えない（店承認を招待で担保）
    expect(isInviteUsable("pending", "pending")).toBe(false);
    // 招待が消費済み・失効なら使えない
    expect(isInviteUsable("accepted", "approved")).toBe(false);
    expect(isInviteUsable("revoked", "approved")).toBe(false);
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
