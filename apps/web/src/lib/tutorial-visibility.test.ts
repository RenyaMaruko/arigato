import { describe, it, expect } from "vitest";
import {
  shouldShowWelcomeTutorial,
  shouldShowModeSwitchTutorial,
} from "./tutorial-visibility.js";

/**
 * チュートリアル表示判定（純粋関数）のテスト。
 * 検証する契約:
 * - 既読情報のロード完了（seenTutorials が配列で来る）までは一切表示しない（チラ見え防止）
 * - welcome: 既読一覧に welcome が無いときだけ表示する
 * - mode_switch: 既読なら出さない・シート表示中は出さない・店員モードでは welcome を優先する
 */
describe("shouldShowWelcomeTutorial", () => {
  it("既読情報が未ロード（undefined）の間は表示しない", () => {
    expect(shouldShowWelcomeTutorial(undefined)).toBe(false);
  });

  it("未読（welcome が無い）なら表示する", () => {
    expect(shouldShowWelcomeTutorial([])).toBe(true);
    expect(shouldShowWelcomeTutorial(["mode_switch"])).toBe(true);
  });

  it("既読（welcome がある）なら表示しない", () => {
    expect(shouldShowWelcomeTutorial(["welcome"])).toBe(false);
    expect(shouldShowWelcomeTutorial(["mode_switch", "welcome"])).toBe(false);
  });
});

describe("shouldShowModeSwitchTutorial", () => {
  it("既読情報が未ロード（undefined）の間は表示しない", () => {
    expect(
      shouldShowModeSwitchTutorial({ mode: "store", seenTutorials: undefined, sheetOpen: false }),
    ).toBe(false);
  });

  it("mode_switch 既読なら表示しない", () => {
    expect(
      shouldShowModeSwitchTutorial({
        mode: "store",
        seenTutorials: ["mode_switch"],
        sheetOpen: false,
      }),
    ).toBe(false);
  });

  it("選択シートが開いている間は表示しない（重なり防止）", () => {
    expect(
      shouldShowModeSwitchTutorial({
        mode: "store",
        seenTutorials: ["welcome"],
        sheetOpen: true,
      }),
    ).toBe(false);
  });

  it("店員モードでは welcome 未読の間は表示しない（welcome 優先・2枚重ねない）", () => {
    expect(
      shouldShowModeSwitchTutorial({ mode: "staff", seenTutorials: [], sheetOpen: false }),
    ).toBe(false);
  });

  it("店員モードで welcome 既読・mode_switch 未読なら表示する", () => {
    expect(
      shouldShowModeSwitchTutorial({
        mode: "staff",
        seenTutorials: ["welcome"],
        sheetOpen: false,
      }),
    ).toBe(true);
  });

  it("店舗管理モードでは welcome 未読でも表示する（welcome は店員ホーム限定のため）", () => {
    expect(
      shouldShowModeSwitchTutorial({ mode: "store", seenTutorials: [], sheetOpen: false }),
    ).toBe(true);
  });
});
