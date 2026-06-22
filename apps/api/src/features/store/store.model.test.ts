import { describe, it, expect } from "vitest";
import {
  isApproved,
  nextStatusOnApprove,
  generateInviteCode,
  buildInviteUrl,
  summarizeGratitudeCounts,
} from "./store.model.js";

/**
 * store Model のテスト（純粋関数）。
 * 承認判定・招待コード生成・招待リンク組み立て・感謝の件数集計を検証する。
 * 件数集計に金額が混入しないこと（入力も出力も件数のみ）を担保する。
 */
describe("store.model", () => {
  it("isApproved は approved のときだけ true", () => {
    expect(isApproved("approved")).toBe(true);
    expect(isApproved("pending")).toBe(false);
  });

  it("nextStatusOnApprove は常に approved（pending→approved・冪等）", () => {
    expect(nextStatusOnApprove("pending")).toBe("approved");
    expect(nextStatusOnApprove("approved")).toBe("approved");
  });

  it("generateInviteCode は URL セーフで十分な長さの一意トークンを返す", () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    // URL セーフな base64url 文字のみ
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 推測されにくい長さ（16バイト → 22文字相当）
    expect(a.length).toBeGreaterThanOrEqual(20);
    // 毎回異なる
    expect(a).not.toBe(b);
  });

  it("buildInviteUrl は /invite/:code の絶対 URL を作る（末尾スラッシュも吸収）", () => {
    expect(buildInviteUrl("https://app.example.com", "abc")).toBe(
      "https://app.example.com/invite/abc",
    );
    expect(buildInviteUrl("https://app.example.com/", "abc")).toBe(
      "https://app.example.com/invite/abc",
    );
  });

  it("summarizeGratitudeCounts: 累計/今日/今週/今月を件数で集計する（金額は扱わない）", () => {
    // 基準時刻: 2026-06-23 12:00 JST（= 2026-06-23 03:00 UTC）
    const now = new Date("2026-06-23T03:00:00Z");
    const counts = summarizeGratitudeCounts(
      [
        // 今日（JST 6/23）
        { receivedAt: "2026-06-23T01:00:00Z" },
        { receivedAt: "2026-06-22T16:00:00Z" }, // JST では 6/23 01:00 → 今日
        // 今週（直近7日）・今月だが今日ではない
        { receivedAt: "2026-06-20T03:00:00Z" },
        // 今月だが今週より前
        { receivedAt: "2026-06-05T03:00:00Z" },
        // 先月（今月でも今週でもない）
        { receivedAt: "2026-05-15T03:00:00Z" },
        // 不正な日時は無視される
        { receivedAt: "not-a-date" },
      ],
      now,
    );

    // 累計は有効な5件
    expect(counts.totalCount).toBe(5);
    // 今日（JST 6/23）は2件
    expect(counts.todayCount).toBe(2);
    // 今週（直近7日: 6/16〜6/23）は 6/23×2 + 6/20 = 3件
    expect(counts.weekCount).toBe(3);
    // 今月（6月）は 6/23×2 + 6/20 + 6/5 = 4件
    expect(counts.monthCount).toBe(4);
  });

  it("summarizeGratitudeCounts: 空配列なら全件数 0", () => {
    const counts = summarizeGratitudeCounts([], new Date("2026-06-23T03:00:00Z"));
    expect(counts).toEqual({ totalCount: 0, todayCount: 0, weekCount: 0, monthCount: 0 });
  });
});
