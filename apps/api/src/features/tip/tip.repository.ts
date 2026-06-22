import { getDb, sql } from "@arigato/db";
import type { TipStatus, SettlementStatus } from "@arigato/shared";

/**
 * tip feature の Repository 層（DB アクセス専用・生 SQL）。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼び出さない。
 *
 * Repository の関数群を「インターフェース（TipRepository）」として束ねて公開し、
 * Service へ注入できる形にする。これにより実 DB が無い環境でも Service を
 * モック Repository でテスト・検証でき、契約（tip レコードの記録・各カラム保存）を
 * 確認可能にする。
 */

// 投げ銭画面の表示情報（staff + store を結合した行）
export type StaffDisplayRow = {
  staffId: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  storeId: string;
  storeName: string;
  // Direct charge の課金先（Connected Account）。未連携は null
  stripeAccountId: string | null;
};

// tip を保存する際に Repository が受け取る値（全カラムを明示）
export type InsertTipParams = {
  staffId: string;
  storeId: string;
  amount: number;
  platformFee: number;
  customerTotal: number;
  message: string | null;
  status: TipStatus;
  settlementStatus: SettlementStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
};

// 突合ジョブが対象にする「決済未確定（pending）」の tip 行。
// Direct charge の Checkout Session / PaymentIntent は Connected Account 上にあるため口座 ID も返す。
// ホスト型 Checkout では PaymentIntent はお客さまの支払い時に作られるため、作成直後は null のことがある。
// その場合は Checkout Session 経由で PaymentIntent を引き当てて突合する（口座 ID 必須）。
export type PendingTipForReconcile = {
  tipId: string;
  // 支払い時に確定した PaymentIntent ID（未確定なら null）
  paymentIntentId: string | null;
  // Direct charge の Checkout Session ID（PaymentIntent が未確定でも突合の起点になる）
  checkoutSessionId: string | null;
  // 課金先の Connected Account（PaymentIntent / Session は口座コンテキストにある）
  connectedAccountId: string;
};

// 保存後・完了画面表示に使う tip の行
export type TipRow = {
  id: string;
  staffId: string;
  storeId: string;
  amount: number;
  platformFee: number;
  customerTotal: number;
  message: string | null;
  status: TipStatus;
  settlementStatus: SettlementStatus;
};

/**
 * Service が依存する Repository の契約（注入点）。
 * 実装は下の createTipRepository（実 DB）。テストではこの型を満たすモックを渡す。
 */
export type TipRepository = {
  // 投げ銭画面の表示情報（staff の名前・一言・顔写真＋所属店名 + Connected Account）を取得
  findStaffDisplay: (staffId: string) => Promise<StaffDisplayRow | null>;
  // tip を1件保存し、保存された行を返す
  insertTip: (params: InsertTipParams) => Promise<TipRow>;
  // tip を ID で取得（完了画面の再掲に使う）
  findTipById: (tipId: string) => Promise<TipRow | null>;
  // tip に Checkout Session ID / PaymentIntent ID を後付けで記録する（Direct charge 作成後の紐付け）。
  // ホスト型 Checkout では PaymentIntent が作成直後 null のことがあるため null を許容する。
  setTipStripeRefs: (
    tipId: string,
    refs: { checkoutSessionId: string; paymentIntentId: string | null },
  ) => Promise<void>;
  // PaymentIntent ID で tip を取得（Webhook で対象 tip を特定する）
  findTipByPaymentIntentId: (paymentIntentId: string) => Promise<TipRow | null>;
  // tip ID をキーに status を更新する（Webhook を正とする確定。ホスト型 Checkout は metadata.tipId で突合）。
  // 同時に確定した PaymentIntent ID も記録する（突合・監査用）。succeeded のときは succeeded_at も now()。
  // 更新できた件数を返す。
  updateTipStatusByTipId: (
    tipId: string,
    status: TipStatus,
    paymentIntentId: string | null,
  ) => Promise<number>;
  // PaymentIntent ID をキーに tip のステータスを更新する（Webhook / 突合の確定。tipId が無い場合の経路）。
  // succeeded のときは succeeded_at も now() で記録する。更新できた件数を返す。
  updateTipStatusByPaymentIntentId: (
    paymentIntentId: string,
    status: TipStatus,
  ) => Promise<number>;
  // 突合ジョブ用: 決済未確定（pending）かつ PaymentIntent 作成済みの tip を列挙する。
  // Webhook 取りこぼし対策で、Stripe の実ステータスと突合するための入口。
  listPendingTipsForReconcile: () => Promise<PendingTipForReconcile[]>;
};

/**
 * 実 DB（Drizzle / postgres-js）に対する Repository 実装を生成する。
 * 生 SQL はここに集約する。getDb() は遅延接続のため、呼ばれて初めて DB へつなぐ。
 */
export function createTipRepository(): TipRepository {
  return {
    // staff と store を結合し、投げ銭画面の表示情報を1件返す
    async findStaffDisplay(staffId) {
      const db = getDb();
      const rows = await db.execute<StaffDisplayRow>(sql`
        SELECT
          s.id                AS "staffId",
          s.display_name      AS "displayName",
          s.headline          AS "headline",
          s.avatar_url        AS "avatarUrl",
          s.stripe_account_id AS "stripeAccountId",
          st.id               AS "storeId",
          st.name             AS "storeName"
        FROM staff s
        JOIN store st ON st.id = s.store_id
        WHERE s.id = ${staffId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // tip を保存し、INSERT した行を RETURNING で返す
    async insertTip(params) {
      const db = getDb();
      const rows = await db.execute<TipRow>(sql`
        INSERT INTO tip (
          staff_id, store_id, amount, platform_fee, customer_total,
          message, status, settlement_status,
          stripe_payment_intent_id, stripe_checkout_session_id, succeeded_at
        ) VALUES (
          ${params.staffId}, ${params.storeId}, ${params.amount},
          ${params.platformFee}, ${params.customerTotal},
          ${params.message}, ${params.status},
          ${params.settlementStatus}, ${params.stripePaymentIntentId},
          ${params.stripeCheckoutSessionId},
          ${params.status === "succeeded" ? sql`now()` : sql`NULL`}
        )
        RETURNING
          id, staff_id AS "staffId", store_id AS "storeId",
          amount, platform_fee AS "platformFee", customer_total AS "customerTotal",
          message, status, settlement_status AS "settlementStatus"
      `);
      return rows[0]!;
    },

    // 完了画面の再掲に使う tip を ID で取得
    async findTipById(tipId) {
      const db = getDb();
      const rows = await db.execute<TipRow>(sql`
        SELECT
          id, staff_id AS "staffId", store_id AS "storeId",
          amount, platform_fee AS "platformFee", customer_total AS "customerTotal",
          message, status, settlement_status AS "settlementStatus"
        FROM tip
        WHERE id = ${tipId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // Direct charge 作成後に Checkout Session ID（と分かれば PaymentIntent ID）を tip へ後付けする。
    // PaymentIntent が未確定（null）のときは既存値を維持する（COALESCE）。
    async setTipStripeRefs(tipId, refs) {
      const db = getDb();
      await db.execute(sql`
        UPDATE tip
        SET stripe_checkout_session_id = ${refs.checkoutSessionId},
            stripe_payment_intent_id = COALESCE(${refs.paymentIntentId}, stripe_payment_intent_id)
        WHERE id = ${tipId}
      `);
    },

    // Webhook で対象 tip を特定するため PaymentIntent ID で1件取得
    async findTipByPaymentIntentId(paymentIntentId) {
      const db = getDb();
      const rows = await db.execute<TipRow>(sql`
        SELECT
          id, staff_id AS "staffId", store_id AS "storeId",
          amount, platform_fee AS "platformFee", customer_total AS "customerTotal",
          message, status, settlement_status AS "settlementStatus"
        FROM tip
        WHERE stripe_payment_intent_id = ${paymentIntentId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // tip ID をキーに status を更新し、確定した PaymentIntent ID も記録する（Webhook を正とする確定）。
    // ホスト型 Checkout では PaymentIntent が支払い時に作られるため、ここで初めて PI が判明することが多い。
    // 既に同じ status へ確定済みなら 0 件（冪等性の補助。重複イベントは webhook_event でも弾く）。
    async updateTipStatusByTipId(tipId, status, paymentIntentId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE tip
        SET status = ${status},
            stripe_payment_intent_id = COALESCE(${paymentIntentId}, stripe_payment_intent_id),
            succeeded_at = ${status === "succeeded" ? sql`now()` : sql`succeeded_at`}
        WHERE id = ${tipId}
          AND status <> ${status}
        RETURNING id
      `);
      return rows.length;
    },

    // PaymentIntent ID をキーに tip のステータスを更新する（Webhook 確定）。
    // succeeded のときは succeeded_at も now() で記録する。更新できた行数を返す。
    async updateTipStatusByPaymentIntentId(paymentIntentId, status) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE tip
        SET status = ${status},
            succeeded_at = ${status === "succeeded" ? sql`now()` : sql`succeeded_at`}
        WHERE stripe_payment_intent_id = ${paymentIntentId}
        RETURNING id
      `);
      return rows.length;
    },

    // 決済未確定（pending）かつ Stripe 参照（Checkout Session または PaymentIntent）を持つ tip を、
    // 課金先口座と併せて列挙する。Webhook 取りこぼし時に Stripe 実ステータスと突合するための入口。
    async listPendingTipsForReconcile() {
      const db = getDb();
      const rows = await db.execute<PendingTipForReconcile>(sql`
        SELECT
          t.id                       AS "tipId",
          t.stripe_payment_intent_id AS "paymentIntentId",
          t.stripe_checkout_session_id AS "checkoutSessionId",
          s.stripe_account_id        AS "connectedAccountId"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        WHERE t.status = 'pending'
          AND s.stripe_account_id IS NOT NULL
          AND (t.stripe_payment_intent_id IS NOT NULL
               OR t.stripe_checkout_session_id IS NOT NULL)
      `);
      return rows;
    },
  };
}
