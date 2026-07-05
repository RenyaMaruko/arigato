import { describe, it, expect } from "vitest";
import { MIN_PAYOUT_AMOUNT } from "@arigato/shared";
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
  evaluatePayoutEligibility,
  selectPayoutTipsWithinAvailable,
  calculateStaffTakeAmount,
  encodeTipCursor,
  decodeTipCursor,
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
    // 要対応（審査NG・追加書類）も着金不可
    expect(canPayout("action_required")).toBe(false);
  });

  // account.updated の抽出結果を模して作るヘルパ（既定は「要求なし・審査項目なし・未承認」）
  const accountState = (
    over: Partial<Parameters<typeof deriveIdentityStatus>[1]> = {},
  ): Parameters<typeof deriveIdentityStatus>[1] => ({
    payoutsEnabled: false,
    requirementsErrorCount: 0,
    pendingVerificationCount: 0,
    pastDueCount: 0,
    currentlyDueCount: 0,
    ...over,
  });

  it("deriveIdentityStatus:【1】payouts_enabled=true で verified に遷移する（最優先）", () => {
    expect(deriveIdentityStatus("none", accountState({ payoutsEnabled: true }))).toBe("verified");
    expect(deriveIdentityStatus("pending", accountState({ payoutsEnabled: true }))).toBe("verified");
    expect(deriveIdentityStatus("action_required", accountState({ payoutsEnabled: true }))).toBe(
      "verified",
    );
    // requirements にエラー・要求の残骸があっても payouts_enabled=true なら verified を優先する
    expect(
      deriveIdentityStatus(
        "pending",
        accountState({ payoutsEnabled: true, requirementsErrorCount: 1, currentlyDueCount: 2 }),
      ),
    ).toBe("verified");
  });

  it("deriveIdentityStatus:【2】一度 verified になったら後退させない（取りこぼし再送・審査NG通知でも）", () => {
    expect(deriveIdentityStatus("verified", accountState())).toBe("verified");
    // 審査NG相当の requirements が届いても verified は維持する
    expect(
      deriveIdentityStatus(
        "verified",
        accountState({ requirementsErrorCount: 2, pastDueCount: 1 }),
      ),
    ).toBe("verified");
    // 審査中相当（pending_verification）が届いても verified は維持する
    expect(
      deriveIdentityStatus("verified", accountState({ pendingVerificationCount: 1 })),
    ).toBe("verified");
  });

  it("deriveIdentityStatus:【3】requirements.errors が1件以上で action_required（審査NG・書類不備）", () => {
    // 例: verification_document_failed_test_mode（審査NG）
    expect(
      deriveIdentityStatus("pending", accountState({ requirementsErrorCount: 1 })),
    ).toBe("action_required");
    // 未着手でも明示エラーがあれば要対応（none からも遷移する）
    expect(
      deriveIdentityStatus("none", accountState({ requirementsErrorCount: 2 })),
    ).toBe("action_required");
    // errors は pending_verification / due より優先する（NG と審査中が同時に立っても要対応）
    expect(
      deriveIdentityStatus(
        "pending",
        accountState({ requirementsErrorCount: 1, pendingVerificationCount: 1, currentlyDueCount: 1 }),
      ),
    ).toBe("action_required");
  });

  it("deriveIdentityStatus:【4】pending_verification が1件以上で pending（提出済み・Stripe が審査中）", () => {
    // 全提出直後（申請完了）＝ none → pending（完了画面の applied 検知・ホーム「ただいま申請中」）
    expect(deriveIdentityStatus("none", accountState({ pendingVerificationCount: 1 }))).toBe(
      "pending",
    );
    // 審査中は pending のまま
    expect(deriveIdentityStatus("pending", accountState({ pendingVerificationCount: 2 }))).toBe(
      "pending",
    );
    // 要対応から修正・再提出で errors が消え審査中になったら pending に戻る
    expect(
      deriveIdentityStatus("action_required", accountState({ pendingVerificationCount: 1 })),
    ).toBe("pending");
    // 審査中に別の未提出要求が残っていても、審査中（pending）を優先する
    expect(
      deriveIdentityStatus(
        "pending",
        accountState({ pendingVerificationCount: 1, currentlyDueCount: 1, pastDueCount: 1 }),
      ),
    ).toBe("pending");
  });

  it("deriveIdentityStatus:【5】要求（currently_due / past_due）だけ残る新規口座は none 据え置き（誤発火バグの本丸）", () => {
    // 新規口座作成直後（ユーザー未操作）: 事前入力の都合で details_submitted=true・past_due=1 が立つが、
    // errors=0・pending_verification=0 のため none のまま（「追加の確認が必要です」を誤って出さない）
    expect(
      deriveIdentityStatus("none", accountState({ currentlyDueCount: 1, pastDueCount: 1 })),
    ).toBe("none");
    // 途中離脱（書類スキップ・currently_due 残り）も none のまま（ホーム「本人確認をする」から再開）
    expect(deriveIdentityStatus("none", accountState({ currentlyDueCount: 5 }))).toBe("none");
    expect(deriveIdentityStatus("none", accountState({ pastDueCount: 3 }))).toBe("none");
  });

  it("deriveIdentityStatus:【5】提出後の人（pending / action_required）への追加要求は action_required", () => {
    // 申請中の人に追加要求（errors なし・due あり）→ 要対応
    expect(deriveIdentityStatus("pending", accountState({ currentlyDueCount: 1 }))).toBe(
      "action_required",
    );
    expect(deriveIdentityStatus("pending", accountState({ pastDueCount: 1 }))).toBe(
      "action_required",
    );
    // 要対応の人に要求が残り続けている間は要対応のまま
    expect(
      deriveIdentityStatus("action_required", accountState({ currentlyDueCount: 1, pastDueCount: 1 })),
    ).toBe("action_required");
  });

  it("deriveIdentityStatus:【6】要求なし・審査項目なしの狭間: none は据え置き・それ以外は pending", () => {
    // 連結アカウント作成直後などの account.updated で「申請中」に見せない（未着手のまま）
    expect(deriveIdentityStatus("none", accountState())).toBe("none");
    // 審査中は pending のまま
    expect(deriveIdentityStatus("pending", accountState())).toBe("pending");
    // 要対応も問題が消えたら pending に戻る
    expect(deriveIdentityStatus("action_required", accountState())).toBe("pending");
  });

  it("evaluatePayoutEligibility: verified必須・最低送金額（全額）の判定", () => {
    // verified でなければ送金不可（本人確認・口座登録が必要）
    expect(evaluatePayoutEligibility("none", 10000)).toBe("not_verified");
    expect(evaluatePayoutEligibility("pending", 10000)).toBe("not_verified");
    // 要対応（審査NG・追加書類）も送金不可
    expect(evaluatePayoutEligibility("action_required", 10000)).toBe("not_verified");
    // verified でも着金可能額が最低送金額未満なら不可（残高0を含む）
    expect(evaluatePayoutEligibility("verified", 0)).toBe("below_minimum");
    expect(evaluatePayoutEligibility("verified", MIN_PAYOUT_AMOUNT - 1)).toBe("below_minimum");
    // verified かつ最低送金額以上なら送金可（全額送金）
    expect(evaluatePayoutEligibility("verified", MIN_PAYOUT_AMOUNT)).toBe("ok");
    expect(evaluatePayoutEligibility("verified", 7650)).toBe("ok");
  });

  it("nextSettlementOnVerified: held のみ payable へ。payable / paid は据え置き（二重遷移しない）", () => {
    expect(nextSettlementOnVerified("held")).toBe("payable");
    expect(nextSettlementOnVerified("payable")).toBe("payable");
    expect(nextSettlementOnVerified("paid")).toBe("paid");
  });

  it("summarizeBalance: settlement 別に金額を合算する（手取り型: 額面→手取り約85%へ変換して合算）", () => {
    // amount は額面。店員さんに見せる残高は手取り（floor(額面×0.85)）へ変換してから合算する
    const summary = summarizeBalance([
      { amount: 300, settlementStatus: "held" }, // floor(255)=255
      { amount: 500, settlementStatus: "held" }, // floor(425)=425
      { amount: 100, settlementStatus: "payable" }, // floor(85)=85
      { amount: 1000, settlementStatus: "paid" }, // floor(850)=850
    ]);
    expect(summary.heldAmount).toBe(255 + 425);
    expect(summary.payableAmount).toBe(85);
    expect(summary.paidAmount).toBe(850);
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

  it("buildTaxReportCsv: 受取日 / 金額 / 店名 の列を含み、金額は手取り（約85%）で出力する", () => {
    // amount は額面で受け取り、CSV では店員手取り（floor(額面×0.85)）へ変換して出力する
    const csv = buildTaxReportCsv([
      { receivedDate: "2025-05-15", amount: 300, storeName: "カフェ Arigato" }, // floor(255)=255
      { receivedDate: "2025-05-14", amount: 100, storeName: "居酒屋, 花" }, // floor(85)=85
    ]);
    // ヘッダに3列がある
    expect(csv).toContain("受取日,金額,店名");
    // 受取記録の行が含まれる（金額は手取り）
    expect(csv).toContain("2025-05-15,255,カフェ Arigato");
    // カンマを含む店名はクオートで囲まれる（金額は手取り）
    expect(csv).toContain('2025-05-14,85,"居酒屋, 花"');
  });

  it("selectPayoutTipsWithinAvailable は available に収まる範囲（FIFO）の手取り合計だけを選ぶ（#5）", () => {
    // 額面 1000(手取り850) / 500(手取り425) / 300(手取り255) の 3件（古い順）。手取り合計は 1530。
    const tips = [
      { tipId: "t1", amount: 1000 },
      { tipId: "t2", amount: 500 },
      { tipId: "t3", amount: 300 },
    ];

    // available=1530 → 全件選ぶ（DB payable 全額が available 以下）
    const all = selectPayoutTipsWithinAvailable(tips, 1530);
    expect(all.amount).toBe(1530);
    expect(all.tipIds).toEqual(["t1", "t2", "t3"]);

    // available=850 → 先頭(850)だけ。次(425)を足すと 1275>850 のため打ち切る（古い分を優先）
    const capped = selectPayoutTipsWithinAvailable(tips, 850);
    expect(capped.amount).toBe(850);
    expect(capped.tipIds).toEqual(["t1"]);

    // available=1300 → 850+425=1275 まで（+255=1530 は超過のため打ち切る）。必ず available 以下
    const partial = selectPayoutTipsWithinAvailable(tips, 1300);
    expect(partial.amount).toBe(1275);
    expect(partial.tipIds).toEqual(["t1", "t2"]);

    // available=0 → 何も選ばない（送金額 0・残高不足を構造的に回避）
    const none = selectPayoutTipsWithinAvailable(tips, 0);
    expect(none.amount).toBe(0);
    expect(none.tipIds).toEqual([]);

    // payable が空（held しか無い等）→ 何も選ばない
    expect(selectPayoutTipsWithinAvailable([], 1000)).toEqual({ tipIds: [], amount: 0 });
  });

  it("先頭(古い)tip が available を超えても打ち切らず、available に収まる後ろの tip を選ぶ（送金できる額>0 なのに送金不可になるバグの回帰）", () => {
    // 古い ¥5000(手取り4250・Stripeはpending) → 新しい ¥1000(手取り850・available)。
    // available=850。先頭の4250は超過するが break せずスキップし、後ろの850を選べること。
    const tips = [
      { tipId: "old", amount: 5000 },
      { tipId: "new", amount: 1000 },
    ];
    const sel = selectPayoutTipsWithinAvailable(tips, 850);
    expect(sel.amount).toBe(850);
    expect(sel.tipIds).toEqual(["new"]);
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

  it("encode/decodeTipCursor: 往復で元の (受取日時, id) に戻る（不透明トークン）", () => {
    const cursor = {
      receivedAt: "2025-05-15T10:32:00Z",
      id: "11111111-1111-1111-1111-111111111111",
    };
    const token = encodeTipCursor(cursor);
    // トークンは中身（ISO・uuid）を直接含まない不透明文字列にする
    expect(token).not.toContain(":");
    expect(token).not.toContain(cursor.id);
    // デコードで元に戻る
    expect(decodeTipCursor(token)).toEqual(cursor);
  });

  it("decodeTipCursor: 不正・欠損・壊れたトークンは null（先頭ページ扱い・落とさない）", () => {
    expect(decodeTipCursor(undefined)).toBeNull();
    expect(decodeTipCursor(null)).toBeNull();
    expect(decodeTipCursor("")).toBeNull();
    // base64url だが区切りが無い（id を割れない）→ null
    expect(decodeTipCursor(Buffer.from("noseparator", "utf8").toString("base64url"))).toBeNull();
    // 区切りはあるが id が空 → null
    expect(
      decodeTipCursor(Buffer.from("2025-05-15T10:32:00Z__", "utf8").toString("base64url")),
    ).toBeNull();
    // 受取日時が空 → null
    expect(decodeTipCursor(Buffer.from("__some-id", "utf8").toString("base64url"))).toBeNull();
  });

  it("calculateStaffTakeAmount は SQL の FLOOR(amount * 0.85) と一致する（代表値）", () => {
    // 合計集計（SQL: FLOOR(amount*0.85)）と per-item 手取り（JS: Math.floor(amount*0.85)）の一致を担保する。
    // 代表値で「JS の手取り」＝「SQL を JS で再現した floor(amount*0.85)」を確認する。
    const cases = [100, 300, 333, 1000, 5000, 50000];
    for (const amount of cases) {
      // SQL の FLOOR(amount * 0.85) と同じ計算（浮動小数の床関数）
      const sqlEquivalent = Math.floor(amount * 0.85);
      expect(calculateStaffTakeAmount(amount)).toBe(sqlEquivalent);
    }
    // 具体値での確認（333 → 283.05 → 283 / 50000 → 42500）
    expect(calculateStaffTakeAmount(333)).toBe(283);
    expect(calculateStaffTakeAmount(50000)).toBe(42500);
  });
});
