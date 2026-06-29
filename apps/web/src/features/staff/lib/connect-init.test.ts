import { describe, it, expect } from "vitest";
import { shouldInitConnectOnboarding } from "./connect-init.js";

/**
 * 埋め込みオンボーディング初期化判定（useConnectOnboarding の中核ロジック）のテスト。
 *
 * 不具合の再発防止: コールド読み込み（/staff/identity 直リンク・/me 未キャッシュ）では
 * enabled が初回 false → データ到着で true に変わる。この false→true 遷移を取りこぼさず初期化し、
 * かつ一度初期化したら再レンダー・再 enabled でも作り直さない（多重生成防止）ことを担保する。
 */
describe("shouldInitConnectOnboarding", () => {
  it("コールド読み込み: enabled が false→true に変わったら初期化する", () => {
    // 初回マウント（/me 未キャッシュ）→ enabled=false・未初期化なので初期化しない
    expect(shouldInitConnectOnboarding(false, false)).toBe(false);
    // データ到着で enabled=true・まだ未初期化 → ここで初期化する（遷移を取りこぼさない）
    expect(shouldInitConnectOnboarding(true, false)).toBe(true);
  });

  it("一度初期化したら再 enabled・再レンダーでも作り直さない（多重生成防止）", () => {
    // 既に初期化済みなら enabled が true のままでも再初期化しない
    expect(shouldInitConnectOnboarding(true, true)).toBe(false);
    // 一旦 false に戻り再び true になっても、初期化済みなら作り直さない
    expect(shouldInitConnectOnboarding(false, true)).toBe(false);
    expect(shouldInitConnectOnboarding(true, true)).toBe(false);
  });

  it("ウォーム読み込み: 初回から enabled=true なら即初期化する", () => {
    // /staff ホーム等から遷移し /me がキャッシュ済みのケース（初回から true）
    expect(shouldInitConnectOnboarding(true, false)).toBe(true);
  });
});
