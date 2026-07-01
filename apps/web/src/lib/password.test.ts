import { describe, it, expect } from "vitest";
import { validatePasswordStrength, PASSWORD_MIN_LENGTH } from "./password.js";

/**
 * パスワード強度検証（純粋関数）のテスト。
 * 空・短すぎるものを弾き、8文字以上を通すことを確認する。
 */
describe("validatePasswordStrength", () => {
  it("空文字は empty で弾く", () => {
    expect(validatePasswordStrength("")).toEqual({ valid: false, reason: "empty" });
  });

  it("7文字（境界の直下）は too_short で弾く", () => {
    expect(validatePasswordStrength("1234567")).toEqual({
      valid: false,
      reason: "too_short",
    });
  });

  it("ちょうど8文字（境界）は通す", () => {
    expect(validatePasswordStrength("12345678")).toEqual({ valid: true });
  });

  it("8文字より長いものは通す", () => {
    expect(validatePasswordStrength("supersecretpass")).toEqual({ valid: true });
  });

  it("最低文字数の定数は 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
