import { describe, it, expect, vi } from "vitest";
import type {
  TipRepository,
  StaffDisplayRow,
  InsertTipParams,
  TipRow,
} from "./tip.repository.js";
import {
  createTipIntent,
  getStaffDisplayInfo,
  getTipComplete,
  StaffNotChargeableError,
  type CreateTipIntentDeps,
} from "./tip.service.js";

/**
 * tip Service 層のユニットテスト。
 * Repository を注入で差し替えられる設計を活かし、実 DB が無い環境でも
 * 「tip レコードが記録され、各カラム（amount / platform_fee / customer_total /
 *  message / staff_id / store_id / membership_id）が保存される」契約をモックで検証する。
 *
 * 多対多モデル: QR は membership（人×店）を指す。Service は membershipId を受け、
 * Repository が membership から staff(人)＋store(店) を解決して表示・記録する。
 * Stripe Direct charge（PaymentIntent 作成）も注入で差し替え、tip が pending で記録され
 * client_secret と connectedAccountId を返すことを確認する（アプリ内決済 UI 埋め込み用）。
 */

// テスト用の membership 表示行（人×店を解決済み・Connected Account 連携済み）
const sampleStaff: StaffDisplayRow = {
  membershipId: "00000000-0000-0000-0000-000000000100",
  staffId: "11111111-1111-1111-1111-111111111111",
  displayName: "山田 さくら",
  headline: "笑顔で接客します",
  avatarUrl: null,
  storeId: "22222222-2222-2222-2222-222222222222",
  storeName: "カフェ Arigato",
  stripeAccountId: "acct_test_123",
};

// Direct charge（PaymentIntent 作成）の注入依存（テスト用のスタブ）
function makeDeps(overrides: Partial<CreateTipIntentDeps> = {}): {
  deps: CreateTipIntentDeps;
  chargeCalls: Array<Parameters<CreateTipIntentDeps["createDirectCharge"]>[0]>;
} {
  const chargeCalls: Array<Parameters<CreateTipIntentDeps["createDirectCharge"]>[0]> = [];
  const deps: CreateTipIntentDeps = {
    createDirectCharge: vi.fn(async (params) => {
      chargeCalls.push(params);
      return {
        clientSecret: "pi_test_abc_secret_xyz",
        paymentIntentId: "pi_test_abc",
      };
    }),
    ...overrides,
  };
  return { deps, chargeCalls };
}

// insertTip に渡された値をそのまま行に整形して返すモック Repository を作る
function makeRepo(overrides: Partial<TipRepository> = {}): {
  repo: TipRepository;
  inserted: InsertTipParams[];
} {
  const inserted: InsertTipParams[] = [];
  const repo: TipRepository = {
    // membership から人＋店を解決した表示行を返す（フォールバックはサンプル）
    findMembershipDisplay: vi.fn(async () => sampleStaff),
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
        status: params.status,
        settlementStatus: params.settlementStatus,
      };
    }),
    findTipById: vi.fn(async () => null),
    setTipStripeRefs: vi.fn(async () => {}),
    findTipByPaymentIntentId: vi.fn(async () => null),
    updateTipStatusByTipId: vi.fn(async () => 0),
    updateTipStatusByPaymentIntentId: vi.fn(async () => 0),
    listPendingTipsForReconcile: vi.fn(async () => []),
    ...overrides,
  };
  return { repo, inserted };
}

describe("tip.service getStaffDisplayInfo", () => {
  it("membership から人＋店を解決し、顔写真・名前・店名・一言を返す。金額は含めない", async () => {
    const { repo } = makeRepo();
    const info = await getStaffDisplayInfo(repo, sampleStaff.membershipId);
    expect(info).toEqual({
      membershipId: sampleStaff.membershipId,
      staffId: sampleStaff.staffId,
      displayName: "山田 さくら",
      headline: "笑顔で接客します",
      avatarUrl: null,
      storeName: "カフェ Arigato",
    });
    // 金額に関わるキーが混入していないこと
    expect(info && "amount" in info).toBe(false);
    // membership 解決が membershipId で呼ばれること
    expect(repo.findMembershipDisplay).toHaveBeenCalledWith(sampleStaff.membershipId);
  });

  it("membership が存在しなければ null", async () => {
    const { repo } = makeRepo({ findMembershipDisplay: vi.fn(async () => null) });
    expect(await getStaffDisplayInfo(repo, "nope")).toBeNull();
  });
});

describe("tip.service createTipIntent（Direct charge・tip レコードの記録）", () => {
  it("¥300・メッセージ付きで各カラムが pending で保存され client_secret を返す", async () => {
    const { repo, inserted } = makeRepo();
    const { deps, chargeCalls } = makeDeps();
    const result = await createTipIntent(repo, deps, sampleStaff.membershipId, {
      amount: 300,
      message: "接客がとても素敵でした！",
    });

    // 1件だけ記録されること
    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;

    // 契約: amount / platform_fee / customer_total / message / staff_id / store_id / membership_id が保存される
    // 手取り型: amount は額面、platform_fee ≈ 11.4%（ceil(34.2)=35）、customer_total = 額面（上乗せなし）
    expect(row.amount).toBe(300);
    expect(row.platformFee).toBe(35);
    expect(row.customerTotal).toBe(300);
    expect(row.message).toBe("接客がとても素敵でした！");
    // staff_id（人）・store_id（membership の店を固定）・membership_id（追跡用）が記録される
    expect(row.staffId).toBe(sampleStaff.staffId);
    expect(row.storeId).toBe(sampleStaff.storeId);
    expect(row.membershipId).toBe(sampleStaff.membershipId);

    // 決済確定は Webhook を正とするため pending・held から開始。挿入時点では Session も PI も未作成
    expect(row.status).toBe("pending");
    expect(row.settlementStatus).toBe("held");
    expect(row.stripePaymentIntentId).toBeNull();
    expect(row.stripeCheckoutSessionId).toBeNull();

    // Direct charge が「店員さんの Connected Account」へ「application_fee = 運営手数料」で作られる
    expect(chargeCalls).toHaveLength(1);
    const charge = chargeCalls[0]!;
    expect(charge.connectedAccountId).toBe("acct_test_123");
    // PaymentIntent には額面（amount=customer_total=300）と application_fee ≈11.4%（35）が渡る
    expect(charge.amount).toBe(300);
    expect(charge.applicationFeeAmount).toBe(35);
    expect(charge.customerTotal).toBe(300);
    expect(charge.tipId).toBe("33333333-3333-3333-3333-333333333333");

    // 作成後に PaymentIntent ID が tip に紐付けられる（Checkout Session は使わないため null）
    expect(repo.setTipStripeRefs).toHaveBeenCalledWith(
      "33333333-3333-3333-3333-333333333333",
      { checkoutSessionId: null, paymentIntentId: "pi_test_abc" },
    );

    // 返り値（フロントは client_secret と connectedAccountId でアプリ内に決済 UI を埋め込む）
    expect(result).toEqual({
      tipId: "33333333-3333-3333-3333-333333333333",
      status: "pending",
      amount: 300,
      platformFee: 35,
      customerTotal: 300,
      clientSecret: "pi_test_abc_secret_xyz",
      connectedAccountId: "acct_test_123",
    });
  });

  it("メッセージ未入力なら message は null で保存される", async () => {
    const { repo, inserted } = makeRepo();
    const { deps } = makeDeps();
    await createTipIntent(repo, deps, sampleStaff.membershipId, { amount: 100 });
    const row = inserted[0]!;
    expect(row.message).toBeNull();
    // 手取り型: amount は額面、platform_fee ≈ 11.4%（ceil(11.4)=12）、customer_total = 額面（上乗せなし）
    expect(row.amount).toBe(100);
    expect(row.platformFee).toBe(12);
    expect(row.customerTotal).toBe(100);
  });

  it("membership が存在しなければ tip を記録せず null を返す（Direct charge も呼ばない）", async () => {
    const { repo, inserted } = makeRepo({ findMembershipDisplay: vi.fn(async () => null) });
    const { deps, chargeCalls } = makeDeps();
    const result = await createTipIntent(repo, deps, "nope", { amount: 300 });
    expect(result).toBeNull();
    expect(inserted).toHaveLength(0);
    expect(chargeCalls).toHaveLength(0);
  });

  it("Connected Account 未連携なら StaffNotChargeableError を投げる（着金口が未準備）", async () => {
    const noAccount: StaffDisplayRow = { ...sampleStaff, stripeAccountId: null };
    const { repo } = makeRepo({ findMembershipDisplay: vi.fn(async () => noAccount) });
    const { deps, chargeCalls } = makeDeps();
    await expect(
      createTipIntent(repo, deps, sampleStaff.membershipId, { amount: 300 }),
    ).rejects.toBeInstanceOf(StaffNotChargeableError);
    // 課金先が無いので Direct charge は呼ばれない
    expect(chargeCalls).toHaveLength(0);
  });
});

describe("tip.service getTipComplete", () => {
  it("当該 tip の送金額・メッセージと送り先名（membership から解決）を再掲する", async () => {
    const tip: TipRow = {
      id: "33333333-3333-3333-3333-333333333333",
      staffId: sampleStaff.staffId,
      storeId: sampleStaff.storeId,
      amount: 300,
      platformFee: 35,
      customerTotal: 300,
      message: "ありがとう",
      status: "succeeded",
      settlementStatus: "held",
    };
    const { repo } = makeRepo({ findTipById: vi.fn(async () => tip) });
    const complete = await getTipComplete(repo, sampleStaff.membershipId, tip.id);
    expect(complete).toEqual({
      tipId: tip.id,
      staffDisplayName: "山田 さくら",
      amount: 300,
      message: "ありがとう",
      status: "succeeded",
    });
  });

  it("URL の membership の店員と tip の staffId が食い違えば null（取り違え防止）", async () => {
    const tip: TipRow = {
      id: "33333333-3333-3333-3333-333333333333",
      // membership が解決する staffId（sampleStaff.staffId）とは別人の tip
      staffId: "99999999-9999-9999-9999-999999999999",
      storeId: sampleStaff.storeId,
      amount: 300,
      platformFee: 35,
      customerTotal: 300,
      message: null,
      status: "succeeded",
      settlementStatus: "held",
    };
    const { repo } = makeRepo({ findTipById: vi.fn(async () => tip) });
    expect(await getTipComplete(repo, sampleStaff.membershipId, tip.id)).toBeNull();
  });

  it("membership が解決できなければ null", async () => {
    const tip: TipRow = {
      id: "33333333-3333-3333-3333-333333333333",
      staffId: sampleStaff.staffId,
      storeId: sampleStaff.storeId,
      amount: 300,
      platformFee: 35,
      customerTotal: 300,
      message: null,
      status: "succeeded",
      settlementStatus: "held",
    };
    const { repo } = makeRepo({
      findTipById: vi.fn(async () => tip),
      findMembershipDisplay: vi.fn(async () => null),
    });
    expect(await getTipComplete(repo, "nope", tip.id)).toBeNull();
  });
});
