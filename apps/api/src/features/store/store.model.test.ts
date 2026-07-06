import { describe, it, expect } from "vitest";
import {
  generateInviteCode,
  buildInviteUrl,
  summarizeGratitudeCounts,
  decideOwnerSuccession,
} from "./store.model.js";

/**
 * store Model のテスト（純粋関数）。
 * 招待コード生成・招待リンク組み立て・感謝の件数集計を検証する。
 * 店はセルフサーブで作成し承認ゲートは持たないため、承認判定のテストは無い。
 * 件数集計に金額が混入しないこと（入力も出力も件数のみ）を担保する。
 */
describe("store.model", () => {
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

  it("summarizeGratitudeCounts: range 未指定なら全期間の件数を totalCount に、今週は weekCount に集計する", () => {
    // 基準時刻: 2026-06-23 12:00 JST（= 2026-06-23 03:00 UTC）
    const now = new Date("2026-06-23T03:00:00Z");
    const counts = summarizeGratitudeCounts(
      [
        // 今週（直近7日）
        { receivedAt: "2026-06-23T01:00:00Z" },
        { receivedAt: "2026-06-20T03:00:00Z" },
        // 今週より前（先月）
        { receivedAt: "2026-05-15T03:00:00Z" },
        // 不正な日時は無視される
        { receivedAt: "not-a-date" },
      ],
      now,
    );

    // range 未指定 → 全期間の有効3件
    expect(counts.totalCount).toBe(3);
    // 今週（直近7日: 6/16〜6/23）は 6/23 + 6/20 = 2件
    expect(counts.weekCount).toBe(2);
  });

  it("summarizeGratitudeCounts: range（from/to）指定で totalCount をその期間に絞る（from は含む・to は排他）", () => {
    const now = new Date("2026-06-23T03:00:00Z");
    const tips = [
      { receivedAt: "2026-05-31T23:59:59Z" }, // 6月の from より前 → 除外
      { receivedAt: "2026-06-01T00:00:00Z" }, // from と同時刻 → 含む（>=）
      { receivedAt: "2026-06-15T03:00:00Z" }, // 期間内
      { receivedAt: "2026-06-30T23:59:59Z" }, // 期間内（to の直前）
      { receivedAt: "2026-07-01T00:00:00Z" }, // to と同時刻 → 排他（<）で除外
    ];
    // 6月（6/1 〜 7/1 排他）
    const counts = summarizeGratitudeCounts(tips, now, {
      from: "2026-06-01T00:00:00Z",
      to: "2026-07-01T00:00:00Z",
    });
    // from を含み to を排他 → 3件
    expect(counts.totalCount).toBe(3);
  });

  it("summarizeGratitudeCounts: weekCount は range 指定に関わらず常に今週（直近7日）", () => {
    const now = new Date("2026-06-23T03:00:00Z");
    const tips = [
      { receivedAt: "2026-06-23T01:00:00Z" }, // 今週
      { receivedAt: "2026-06-20T03:00:00Z" }, // 今週
      { receivedAt: "2026-05-15T03:00:00Z" }, // 先月（今週ではない）
    ];
    // 先月レンジを指定しても weekCount は今週のまま（2件）
    const counts = summarizeGratitudeCounts(tips, now, {
      from: "2026-05-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
    });
    // totalCount は先月レンジ → 1件、weekCount は常に今週 → 2件
    expect(counts.totalCount).toBe(1);
    expect(counts.weekCount).toBe(2);
  });

  it("summarizeGratitudeCounts: 空配列なら全件数 0", () => {
    const counts = summarizeGratitudeCounts([], new Date("2026-06-23T03:00:00Z"));
    expect(counts).toEqual({ totalCount: 0, weekCount: 0 });
  });

  // owner 自動継承の判定（owner ライフサイクル §5.4）
  it("decideOwnerSuccession: 残る管理者がいれば最古参（created_at 最小）を昇格する", () => {
    const decision = decideOwnerSuccession([
      { authUserId: "new", createdAt: "2026-06-25T00:00:00Z" },
      { authUserId: "old", createdAt: "2026-06-24T00:00:00Z" },
      { authUserId: "mid", createdAt: "2026-06-24T12:00:00Z" },
    ]);
    expect(decision).toEqual({ kind: "promote", authUserId: "old" });
  });

  it("decideOwnerSuccession: created_at 同着は authUserId 昇順で決定的に選ぶ", () => {
    const decision = decideOwnerSuccession([
      { authUserId: "b", createdAt: "2026-06-24T00:00:00Z" },
      { authUserId: "a", createdAt: "2026-06-24T00:00:00Z" },
    ]);
    expect(decision).toEqual({ kind: "promote", authUserId: "a" });
  });

  it("decideOwnerSuccession: 残る管理者がいなければ閉店（close）を返す", () => {
    expect(decideOwnerSuccession([])).toEqual({ kind: "close" });
  });
});
