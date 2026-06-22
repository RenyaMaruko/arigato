import { describe, it, expect, vi } from "vitest";
import type {
  TipRepository,
  StaffDisplayRow,
  InsertTipParams,
  TipRow,
} from "./tip.repository.js";
import { createTipIntent, getStaffDisplayInfo, getTipComplete } from "./tip.service.js";

/**
 * tip Service 層のユニットテスト。
 * Repository を注入で差し替えられる設計を活かし、実 DB が無い環境でも
 * 「tip レコードが記録され、各カラム（amount / platform_fee / customer_total /
 *  message / stamp / staff_id / store_id）が保存される」契約をモックで検証する。
 */

// テスト用の staff 表示行
const sampleStaff: StaffDisplayRow = {
  staffId: "11111111-1111-1111-1111-111111111111",
  displayName: "山田 さくら",
  headline: "笑顔で接客します",
  avatarUrl: null,
  storeId: "22222222-2222-2222-2222-222222222222",
  storeName: "カフェ Arigato",
};

// insertTip に渡された値をそのまま行に整形して返すモック Repository を作る
function makeRepo(overrides: Partial<TipRepository> = {}): {
  repo: TipRepository;
  inserted: InsertTipParams[];
} {
  const inserted: InsertTipParams[] = [];
  const repo: TipRepository = {
    findStaffDisplay: vi.fn(async () => sampleStaff),
    insertTip: vi.fn(async (params: InsertTipParams): Promise<TipRow> => {
      inserted.push(params);
      return {
        id: "33333333-3333-3333-3333-333333333333",
        staffId: params.staffId,
        storeId: params.storeId,
        amount: params.amount,
        platformFee: params.platformFee,
        customerTotal: params.customerTotal,
        message: params.message,
        stamp: params.stamp,
        status: params.status,
        settlementStatus: params.settlementStatus,
      };
    }),
    findTipById: vi.fn(async () => null),
    ...overrides,
  };
  return { repo, inserted };
}

describe("tip.service getStaffDisplayInfo", () => {
  it("顔写真・名前・店名・一言を返し、金額は含めない", async () => {
    const { repo } = makeRepo();
    const info = await getStaffDisplayInfo(repo, sampleStaff.staffId);
    expect(info).toEqual({
      staffId: sampleStaff.staffId,
      displayName: "山田 さくら",
      headline: "笑顔で接客します",
      avatarUrl: null,
      storeName: "カフェ Arigato",
    });
    // 金額に関わるキーが混入していないこと
    expect(info && "amount" in info).toBe(false);
  });

  it("staff が存在しなければ null", async () => {
    const { repo } = makeRepo({ findStaffDisplay: vi.fn(async () => null) });
    expect(await getStaffDisplayInfo(repo, "nope")).toBeNull();
  });
});

describe("tip.service createTipIntent（tip レコードの記録）", () => {
  it("¥300・メッセージ・スタンプ付きで各カラムが正しく保存される", async () => {
    const { repo, inserted } = makeRepo();
    const result = await createTipIntent(repo, sampleStaff.staffId, {
      amount: 300,
      message: "接客がとても素敵でした！",
      stamp: "heart",
    });

    // 1件だけ記録されること
    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;

    // 契約: amount / platform_fee / customer_total / message / stamp / staff_id / store_id が保存される
    expect(row.amount).toBe(300);
    expect(row.platformFee).toBe(30);
    expect(row.customerTotal).toBe(330);
    expect(row.message).toBe("接客がとても素敵でした！");
    expect(row.stamp).toBe("heart");
    expect(row.staffId).toBe(sampleStaff.staffId);
    expect(row.storeId).toBe(sampleStaff.storeId);

    // モック決済成立 → succeeded、保留残高 held から開始、PaymentIntent ID が付与される
    expect(row.status).toBe("succeeded");
    expect(row.settlementStatus).toBe("held");
    expect(row.stripePaymentIntentId).toMatch(/^pi_mock_/);

    // 返り値（完了画面へ渡す最小情報）
    expect(result).toEqual({
      tipId: "33333333-3333-3333-3333-333333333333",
      status: "succeeded",
      amount: 300,
      platformFee: 30,
      customerTotal: 330,
    });
  });

  it("メッセージ・スタンプ未入力なら message / stamp は null で保存される", async () => {
    const { repo, inserted } = makeRepo();
    await createTipIntent(repo, sampleStaff.staffId, { amount: 100 });
    const row = inserted[0]!;
    expect(row.message).toBeNull();
    expect(row.stamp).toBeNull();
    expect(row.amount).toBe(100);
    expect(row.platformFee).toBe(10);
    expect(row.customerTotal).toBe(110);
  });

  it("staff が存在しなければ tip を記録せず null を返す", async () => {
    const { repo, inserted } = makeRepo({ findStaffDisplay: vi.fn(async () => null) });
    const result = await createTipIntent(repo, "nope", { amount: 300 });
    expect(result).toBeNull();
    expect(inserted).toHaveLength(0);
  });
});

describe("tip.service getTipComplete", () => {
  it("当該 tip の送金額・メッセージ・スタンプと送り先名を再掲する", async () => {
    const tip: TipRow = {
      id: "33333333-3333-3333-3333-333333333333",
      staffId: sampleStaff.staffId,
      storeId: sampleStaff.storeId,
      amount: 300,
      platformFee: 30,
      customerTotal: 330,
      message: "ありがとう",
      stamp: "smile",
      status: "succeeded",
      settlementStatus: "held",
    };
    const { repo } = makeRepo({ findTipById: vi.fn(async () => tip) });
    const complete = await getTipComplete(repo, sampleStaff.staffId, tip.id);
    expect(complete).toEqual({
      tipId: tip.id,
      staffDisplayName: "山田 さくら",
      amount: 300,
      message: "ありがとう",
      stamp: "smile",
    });
  });

  it("URL の staffId と tip の staffId が食い違えば null（取り違え防止）", async () => {
    const tip: TipRow = {
      id: "33333333-3333-3333-3333-333333333333",
      staffId: "99999999-9999-9999-9999-999999999999",
      storeId: sampleStaff.storeId,
      amount: 300,
      platformFee: 30,
      customerTotal: 330,
      message: null,
      stamp: null,
      status: "succeeded",
      settlementStatus: "held",
    };
    const { repo } = makeRepo({ findTipById: vi.fn(async () => tip) });
    expect(await getTipComplete(repo, sampleStaff.staffId, tip.id)).toBeNull();
  });
});
