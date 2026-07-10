import { describe, it, expect, vi } from "vitest";
import {
  groupPendingByAvailableDate,
  reconcilePendingBuckets,
  deriveWalletDomain,
  registerWalletDomainSafely,
  type PendingTransactionLike,
} from "./stripe-connect.js";

/**
 * 準備中（pending）の balance_transactions を「available_on の暦日ごと（Asia/Tokyo 基準）」に
 * 集計する純粋関数のテスト。暦日でまとめる・同日合算・昇順・空配列・合計一致を検証する。
 * 実 Stripe を叩かずに集計ロジックを担保するのがこのテストの目的（複数日付の pending を
 * 実環境で作るのは難しいため、集計はここで保証する）。
 */

// JST の特定日時（YYYY-MM-DDTHH:mm:ss+09:00）を epoch 秒に直すヘルパ
function jst(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

// テスト用の pending トランザクションを作る（既定は JPY・pending・net=手取り）
function txn(overrides: Partial<PendingTransactionLike>): PendingTransactionLike {
  return {
    status: "pending",
    currency: "jpy",
    net: 100,
    available_on: jst("2026-07-01T12:00:00+09:00"),
    ...overrides,
  };
}

describe("groupPendingByAvailableDate", () => {
  // 「今」は 2026-06-30 12:00 JST（以降の available_on を未来とみなす）
  const now = jst("2026-06-30T12:00:00+09:00");

  it("対象が無ければ空配列を返す", () => {
    expect(groupPendingByAvailableDate([], now)).toEqual([]);
  });

  it("available_on を暦日（JST）でまとめ、同じ日は合算する", () => {
    const txns = [
      // 7/1 の午前と午後（JST 上は同じ暦日）→ 合算される
      txn({ net: 100, available_on: jst("2026-07-01T09:00:00+09:00") }),
      txn({ net: 200, available_on: jst("2026-07-01T23:30:00+09:00") }),
      // 7/3
      txn({ net: 50, available_on: jst("2026-07-03T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(2);
    // 7/1 は合算 300、7/3 は 50
    expect(buckets[0]!.amount).toBe(300);
    expect(buckets[1]!.amount).toBe(50);
    // availableOn はその日の 0:00（JST）＝ UTC 前日 15:00
    expect(buckets[0]!.availableOn).toBe(new Date(jst("2026-07-01T00:00:00+09:00") * 1000).toISOString());
    expect(buckets[1]!.availableOn).toBe(new Date(jst("2026-07-03T00:00:00+09:00") * 1000).toISOString());
  });

  it("UTC 跨ぎ（JST 0:30）でも JST の暦日でまとまる", () => {
    // JST 7/2 0:30（UTC では 7/1 15:30）→ JST 暦日は 7/2 に入る
    const txns = [
      txn({ net: 100, available_on: jst("2026-07-02T00:30:00+09:00") }),
      txn({ net: 100, available_on: jst("2026-07-02T20:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.amount).toBe(200);
    expect(buckets[0]!.availableOn).toBe(new Date(jst("2026-07-02T00:00:00+09:00") * 1000).toISOString());
  });

  it("日付昇順で返す（入力順に依らない）", () => {
    const txns = [
      txn({ net: 30, available_on: jst("2026-07-05T10:00:00+09:00") }),
      txn({ net: 10, available_on: jst("2026-07-01T10:00:00+09:00") }),
      txn({ net: 20, available_on: jst("2026-07-03T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets.map((b) => b.amount)).toEqual([10, 20, 30]);
  });

  it("pending 以外・既に available（過去）・JPY 以外は除外する", () => {
    const txns = [
      // available（pending でない）→ 除外
      txn({ status: "available", net: 999, available_on: jst("2026-07-01T10:00:00+09:00") }),
      // available_on が過去（now 以前）→ 除外
      txn({ net: 999, available_on: jst("2026-06-29T10:00:00+09:00") }),
      // JPY 以外 → 除外
      txn({ currency: "usd", net: 999, available_on: jst("2026-07-01T10:00:00+09:00") }),
      // 有効な pending（残るのはこれだけ）
      txn({ net: 100, available_on: jst("2026-07-01T10:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.amount).toBe(100);
  });

  it("本番実測ケース: net（手取り）で集計し、reconcile 後も変わらない（diff=0）", () => {
    // 実測: ¥300決済（net=255・7/16）＋ ¥3,000決済×2（net=2550・7/17）、balance.pending=5355（net 合計）
    const txns = [
      txn({ net: 255, available_on: jst("2026-07-16T09:00:00+09:00") }),
      txn({ net: 2550, available_on: jst("2026-07-17T09:00:00+09:00") }),
      txn({ net: 2550, available_on: jst("2026-07-17T18:00:00+09:00") }),
    ];
    const buckets = groupPendingByAvailableDate(txns, now);
    // 「7月16日から ¥255」「7月17日から ¥5,100」になる（総額 300/6,000 ではない）
    expect(buckets).toEqual([
      {
        availableOn: new Date(jst("2026-07-16T00:00:00+09:00") * 1000).toISOString(),
        amount: 255,
      },
      {
        availableOn: new Date(jst("2026-07-17T00:00:00+09:00") * 1000).toISOString(),
        amount: 5100,
      },
    ]);
    // net ベースならバケット合計＝pendingAmount で diff=0 → reconcile してもそのまま（¥0行は生まれない）
    const reconciled = reconcilePendingBuckets(buckets, 5355);
    expect(reconciled).toEqual(buckets);
    expect(reconciled.reduce((s, b) => s + b.amount, 0)).toBe(5355);
  });
});

describe("reconcilePendingBuckets", () => {
  const d1 = { availableOn: "2026-07-01T00:00:00.000Z", amount: 200 };
  const d2 = { availableOn: "2026-07-03T00:00:00.000Z", amount: 100 };

  it("合計が pendingAmount と一致していればそのまま返す", () => {
    const result = reconcilePendingBuckets([d1, d2], 300);
    expect(result).toEqual([d1, d2]);
    expect(result.reduce((s, b) => s + b.amount, 0)).toBe(300);
  });

  it("バケット合計が不足する場合、残差を最早バケットに寄せて合計を一致させる", () => {
    // ページングで 50 取りこぼし → pendingAmount=350 だがバケット合計=300
    const result = reconcilePendingBuckets([d1, d2], 350);
    // 残差 50 を先頭（最早）へ寄せる
    expect(result[0]!.amount).toBe(250);
    expect(result[1]!.amount).toBe(100);
    expect(result.reduce((s, b) => s + b.amount, 0)).toBe(350);
  });

  it("バケットが空なら寄せ先が無く空配列のまま（UI 側の保険表示に委ねる）", () => {
    expect(reconcilePendingBuckets([], 300)).toEqual([]);
  });

  it("元の配列を破壊しない（イミュータブル）", () => {
    const input = [{ ...d1 }, { ...d2 }];
    reconcilePendingBuckets(input, 350);
    expect(input[0]!.amount).toBe(200);
  });
});

/**
 * WEB_BASE_URL から決済手段ドメイン（Apple Pay / Google Pay の可否判定に使うホスト名）を
 * 導出する純粋関数のテスト。https 本番ホスト・localhost・未設定・ポート付きの分岐を検証する。
 */
describe("deriveWalletDomain", () => {
  it("https の本番ホストからホスト名を導出する", () => {
    expect(deriveWalletDomain("https://arigato-web.unkuncunk.workers.dev")).toBe(
      "arigato-web.unkuncunk.workers.dev",
    );
  });

  it("パス付きでもホスト名だけ返す（ポート・パスは含めない）", () => {
    expect(deriveWalletDomain("https://example.com/app/")).toBe("example.com");
  });

  it("未設定（undefined / null / 空文字）は null（登録スキップ）", () => {
    expect(deriveWalletDomain(undefined)).toBeNull();
    expect(deriveWalletDomain(null)).toBeNull();
    expect(deriveWalletDomain("")).toBeNull();
  });

  it("localhost は null（ローカル開発では Apple Pay 自体が動かない）", () => {
    expect(deriveWalletDomain("http://localhost")).toBeNull();
    // ポート付き localhost:5173 もスキップ対象（hostname は localhost）
    expect(deriveWalletDomain("http://localhost:5173")).toBeNull();
    // サブドメイン形式の *.localhost も同様
    expect(deriveWalletDomain("http://app.localhost:5173")).toBeNull();
  });

  it("scheme 無しの 'localhost:5173' のような文字列も null（URL として不正）", () => {
    expect(deriveWalletDomain("localhost:5173")).toBeNull();
    expect(deriveWalletDomain("not a url")).toBeNull();
  });

  it("IP アドレスは null（ドメイン検証の対象にならない）", () => {
    expect(deriveWalletDomain("http://127.0.0.1:8787")).toBeNull();
    expect(deriveWalletDomain("http://192.168.1.10")).toBeNull();
    expect(deriveWalletDomain("http://[::1]:5173")).toBeNull();
  });
});

/**
 * 連結アカウント作成直後に呼ぶドメイン登録ヘルパ（registerWalletDomainSafely）のテスト。
 * 「登録失敗が非致命であること」「localhost / 未設定では登録しないこと」を、
 * 実 Stripe を叩かずに（register を注入して）検証する。
 */
describe("registerWalletDomainSafely", () => {
  it("本番ホストなら導出したドメインで register を呼ぶ", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    await registerWalletDomainSafely(
      "acct_test123",
      "https://arigato-web.unkuncunk.workers.dev",
      register,
    );
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith("acct_test123", "arigato-web.unkuncunk.workers.dev");
  });

  it("localhost（ポート付き含む）では register を呼ばない", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    await registerWalletDomainSafely("acct_test123", "http://localhost:5173", register);
    expect(register).not.toHaveBeenCalled();
  });

  it("WEB_BASE_URL 未設定では register を呼ばない", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    await registerWalletDomainSafely("acct_test123", undefined, register);
    expect(register).not.toHaveBeenCalled();
  });

  it("register が失敗しても throw しない（非致命）。console.error にログを残す", async () => {
    const register = vi.fn().mockRejectedValue(new Error("stripe error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // 失敗しても reject されない＝アカウント作成フローを止めない
      await expect(
        registerWalletDomainSafely("acct_test123", "https://example.com", register),
      ).resolves.toBeUndefined();
      // 後追い対応できるようエラーログは残す
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0]![0])).toContain("acct_test123");
      expect(String(errorSpy.mock.calls[0]![0])).toContain("example.com");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
