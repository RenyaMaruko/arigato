import { randomUUID } from "node:crypto";
import type {
  TipRepository,
  StaffDisplayRow,
  TipRow,
  InsertTipParams,
} from "./tip.repository.js";

/**
 * tip feature の Repository 層・インメモリ実装（DB 接続が無い環境向けフォールバック）。
 *
 * DATABASE_URL が未設定でもお客さま投げ銭フロー（表示→記録→完了）を一通り通すための実装。
 * 本物の DB と同じ TipRepository 契約を満たすため、Service / Route から見ると差し替え可能で、
 * 4層分離（Repository だけが永続化を知る）を崩さない。
 * 永続化はプロセスのメモリ上に持つ Map のみで、再起動で消える（開発・評価用途）。
 */

// 評価・デモ用に最初から入っている店員さんのサンプル表示情報
// （URL の :staffId が未知でも、安心して投げ銭フローを試せるようにする）
const sampleStaff: StaffDisplayRow = {
  staffId: "00000000-0000-0000-0000-000000000001",
  displayName: "山田 さくら",
  headline: "笑顔で接客します",
  avatarUrl: null,
  storeId: "00000000-0000-0000-0000-000000000010",
  storeName: "カフェ Arigato",
  // DB 無し環境では Connected Account を持たない（Direct charge は DB 接続時に検証する）
  stripeAccountId: null,
};

/**
 * インメモリの TipRepository を生成する。
 * findStaffDisplay は「どの staffId でもサンプル店員さんを返す」フォールバック挙動にして、
 * 任意の /tip/:staffId（例: /tip/test-staff-id）でも画面が成立するようにする。
 */
export function createInMemoryTipRepository(): TipRepository {
  // tipId → 保存済み tip 行
  const tips = new Map<string, TipRow>();
  // PaymentIntent ID → tipId（Webhook での突合に使う）
  const piIndex = new Map<string, string>();

  return {
    // どんな staffId でもサンプル店員さんの表示情報を返す（URL の id を採用して整合させる）
    async findStaffDisplay(staffId) {
      return { ...sampleStaff, staffId };
    },

    // tip をメモリに1件保存し、保存後の行を返す
    async insertTip(params: InsertTipParams) {
      const id = randomUUID();
      const row: TipRow = {
        id,
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
      tips.set(id, row);
      // PaymentIntent ID があれば突合用の索引に登録する
      if (params.stripePaymentIntentId) {
        piIndex.set(params.stripePaymentIntentId, id);
      }
      return row;
    },

    // 完了画面の再掲に使う tip を ID で取得
    async findTipById(tipId) {
      return tips.get(tipId) ?? null;
    },

    // Direct charge 作成後に Checkout Session / PaymentIntent の参照を tip へ後付けで記録する。
    // PaymentIntent が判明していれば突合用の索引に登録する（null のことがある）。
    async setTipStripeRefs(tipId, refs) {
      const row = tips.get(tipId);
      if (!row) return;
      if (refs.paymentIntentId) {
        piIndex.set(refs.paymentIntentId, tipId);
      }
    },

    // PaymentIntent ID で tip を取得（Webhook の突合用）
    async findTipByPaymentIntentId(paymentIntentId) {
      const tipId = piIndex.get(paymentIntentId);
      if (!tipId) return null;
      return tips.get(tipId) ?? null;
    },

    // tip ID をキーに status を更新し、PaymentIntent ID も索引へ登録する（Webhook を正とする確定）。
    // 既に同じ status なら 0 件（冪等性の補助）。
    async updateTipStatusByTipId(tipId, status, paymentIntentId) {
      const row = tips.get(tipId);
      if (!row) return 0;
      if (row.status === status) return 0;
      tips.set(tipId, { ...row, status });
      if (paymentIntentId) {
        piIndex.set(paymentIntentId, tipId);
      }
      return 1;
    },

    // PaymentIntent ID をキーに tip のステータスを更新する（Webhook 確定）
    async updateTipStatusByPaymentIntentId(paymentIntentId, status) {
      const tipId = piIndex.get(paymentIntentId);
      if (!tipId) return 0;
      const row = tips.get(tipId);
      if (!row) return 0;
      tips.set(tipId, { ...row, status });
      return 1;
    },

    // 突合ジョブ用: pending かつ PaymentIntent 作成済みの tip を列挙する。
    // インメモリ実装は Connected Account を持たないため、突合対象は基本的に空になる。
    async listPendingTipsForReconcile() {
      return [];
    },
  };
}
