import { getDb, sql } from "@arigato/db";
import type { TipStatus, SettlementStatus, IdentityStatus } from "@arigato/shared";
import { initialSettlementStatusOnSucceeded } from "./tip.model.js";

/**
 * tip feature の Repository 層（DB アクセス専用・生 SQL）。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼び出さない。
 *
 * Repository の関数群を「インターフェース（TipRepository）」として束ねて公開し、
 * Service へ注入できる形にする。これにより実 DB が無い環境でも Service を
 * モック Repository でテスト・検証でき、契約（tip レコードの記録・各カラム保存）を
 * 確認可能にする。
 */

// 投げ銭画面の表示情報（membership=staff_store から staff(人)＋store(店) を結合した行）
export type StaffDisplayRow = {
  // QR が指す所属（membership＝staff_store.id）
  membershipId: string;
  // 送り先の店員さん（人）の ID
  staffId: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  // membership の店（送信時に tip へ固定保存する）
  storeId: string;
  storeName: string;
  // Direct charge の課金先（人の Connected Account）。未連携は null
  stripeAccountId: string | null;
  // この所属が脱退済み（在籍解除済み）か。true なら新規投げ銭を受け付けない（再参加で再開）。
  // left_at IS NULL → false（在籍中・受付中）、値あり → true（脱退中・受付停止）。
  left: boolean;
};

// tip を保存する際に Repository が受け取る値（全カラムを明示）
export type InsertTipParams = {
  staffId: string;
  storeId: string;
  // 送信元の所属（membership）。追跡用
  membershipId: string;
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
  // 投げ銭画面の表示情報を membership（staff_store.id）から取得する。
  // membership → staff(人)＋store(店) を解決し、名前・一言・顔写真・店名・Connected Account を返す
  findMembershipDisplay: (membershipId: string) => Promise<StaffDisplayRow | null>;
  // tip を1件保存し、保存された行を返す
  insertTip: (params: InsertTipParams) => Promise<TipRow>;
  // tip を ID で取得（完了画面の再掲に使う）
  findTipById: (tipId: string) => Promise<TipRow | null>;
  // tip に PaymentIntent ID（と任意の Checkout Session ID）を後付けで記録する（Direct charge 作成後の紐付け）。
  // PaymentIntent 方式では作成時点で PaymentIntent ID が確定する。Checkout Session は使わないため null。
  setTipStripeRefs: (
    tipId: string,
    refs: { checkoutSessionId: string | null; paymentIntentId: string | null },
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
  // (c) 確定見込み（charge / balance_transaction）を tip に鏡保存する（Stripe を正・自前は鏡）。
  //   tipId か PaymentIntent ID で対象 tip を特定し、stripe_charge_id / balance_transaction_id /
  //   available_on / bt_status を更新する。null の項目は既存値を維持する（COALESCE。後続イベントで埋め直せる）。
  //   更新できた件数を返す。
  saveTipChargeSettlement: (params: {
    tipId: string | null;
    paymentIntentId: string | null;
    chargeId: string;
    balanceTransactionId: string | null;
    availableOn: Date | null;
    btStatus: "pending" | "available" | null;
  }) => Promise<number>;
  // (f) 返金・チャージバックで tip を refunded / disputed へ遷移する（残高・履歴・送金候補から除外）。
  //   charge ID（主）または PaymentIntent ID（従）で対象 tip を特定する。
  //   既に同じ終端状態なら 0 件（冪等）。遷移できた tip の id・staff_id・amount を返す（台帳補正・逆引き用）。
  applySettlementCorrectionToTip: (params: {
    settlementStatus: "refunded" | "disputed";
    chargeId: string | null;
    paymentIntentId: string | null;
  }) => Promise<{ tipId: string; staffId: string; amount: number } | null>;
};

/**
 * 実 DB（Drizzle / postgres-js）に対する Repository 実装を生成する。
 * 生 SQL はここに集約する。getDb() は遅延接続のため、呼ばれて初めて DB へつなぐ。
 */
export function createTipRepository(): TipRepository {
  return {
    // membership（staff_store）から staff(人)＋store(店) を解決し、投げ銭画面の表示情報を1件返す
    async findMembershipDisplay(membershipId) {
      const db = getDb();
      const rows = await db.execute<StaffDisplayRow>(sql`
        SELECT
          ss.id               AS "membershipId",
          s.id                AS "staffId",
          s.display_name      AS "displayName",
          s.headline          AS "headline",
          s.avatar_url        AS "avatarUrl",
          s.stripe_account_id AS "stripeAccountId",
          st.id               AS "storeId",
          st.name             AS "storeName",
          (ss.left_at IS NOT NULL) AS "left"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        JOIN store st ON st.id = ss.store_id
        WHERE ss.id = ${membershipId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // tip を保存し、INSERT した行を RETURNING で返す
    async insertTip(params) {
      const db = getDb();
      const rows = await db.execute<TipRow>(sql`
        INSERT INTO tip (
          staff_id, store_id, membership_id, amount, platform_fee, customer_total,
          message, status, settlement_status,
          stripe_payment_intent_id, stripe_checkout_session_id, succeeded_at
        ) VALUES (
          ${params.staffId}, ${params.storeId}, ${params.membershipId}, ${params.amount},
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

    // Direct charge 作成後に PaymentIntent ID（と任意の Checkout Session ID）を tip へ後付けする。
    // null の項目は既存値を維持する（COALESCE）。PaymentIntent 方式では Checkout Session は使わず null。
    async setTipStripeRefs(tipId, refs) {
      const db = getDb();
      await db.execute(sql`
        UPDATE tip
        SET stripe_checkout_session_id = COALESCE(${refs.checkoutSessionId}, stripe_checkout_session_id),
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
    //
    // succeeded 確定時は、送り先店員さんの本人確認状態（identity_status）から settlement_status を確定する
    // （spec §7「本人確認済の状態で成立した分は succeeded 時に payable から開始」）。判定は Model 純粋関数に委ねる。
    async updateTipStatusByTipId(tipId, status, paymentIntentId) {
      const db = getDb();
      // succeeded への確定は、staff の identity_status を見て settlement_status を決める（1トランザクション）
      if (status === "succeeded") {
        return await db.transaction(async (tx) => {
          // 対象 tip と送り先店員さんの本人確認状態を取得（未確定の tip のみ）
          const found = await tx.execute<{ identityStatus: IdentityStatus }>(sql`
            SELECT s.identity_status AS "identityStatus"
            FROM tip t
            JOIN staff s ON s.id = t.staff_id
            WHERE t.id = ${tipId}
              AND t.status <> 'succeeded'
            LIMIT 1
            FOR UPDATE OF t
          `);
          const target = found[0];
          if (!target) return 0;

          // 本人確認済なら payable、未verified なら held から開始（判定は Model 純粋関数）
          const settlement = initialSettlementStatusOnSucceeded(target.identityStatus);
          const rows = await tx.execute<{ id: string }>(sql`
            UPDATE tip
            SET status = 'succeeded',
                settlement_status = ${settlement},
                stripe_payment_intent_id = COALESCE(${paymentIntentId}, stripe_payment_intent_id),
                succeeded_at = now()
            WHERE id = ${tipId}
              AND status <> 'succeeded'
            RETURNING id
          `);
          return rows.length;
        });
      }

      // succeeded 以外（failed 等）は settlement_status を触らずステータスのみ更新する
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE tip
        SET status = ${status},
            stripe_payment_intent_id = COALESCE(${paymentIntentId}, stripe_payment_intent_id)
        WHERE id = ${tipId}
          AND status <> ${status}
        RETURNING id
      `);
      return rows.length;
    },

    // PaymentIntent ID をキーに tip のステータスを更新する（Webhook 確定。tipId が無い場合の従経路）。
    // succeeded のときは staff の identity_status から settlement_status を確定する（Model 純粋関数で判定）。
    // succeeded 以外は settlement_status を触らない。更新できた行数を返す。
    async updateTipStatusByPaymentIntentId(paymentIntentId, status) {
      const db = getDb();
      if (status === "succeeded") {
        return await db.transaction(async (tx) => {
          // PaymentIntent ID で未確定の tip と送り先店員さんの本人確認状態を取得
          const found = await tx.execute<{ id: string; identityStatus: IdentityStatus }>(sql`
            SELECT t.id AS "id", s.identity_status AS "identityStatus"
            FROM tip t
            JOIN staff s ON s.id = t.staff_id
            WHERE t.stripe_payment_intent_id = ${paymentIntentId}
              AND t.status <> 'succeeded'
            LIMIT 1
            FOR UPDATE OF t
          `);
          const target = found[0];
          if (!target) return 0;

          // 本人確認済なら payable、未verified なら held から開始（判定は Model 純粋関数）
          const settlement = initialSettlementStatusOnSucceeded(target.identityStatus);
          const rows = await tx.execute<{ id: string }>(sql`
            UPDATE tip
            SET status = 'succeeded',
                settlement_status = ${settlement},
                succeeded_at = now()
            WHERE id = ${target.id}
            RETURNING id
          `);
          return rows.length;
        });
      }

      // succeeded 以外（failed 等）は settlement_status を触らずステータスのみ更新する
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE tip
        SET status = ${status}
        WHERE stripe_payment_intent_id = ${paymentIntentId}
          AND status <> ${status}
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

    // (c) 確定見込み（charge / balance_transaction）を tip へ鏡保存する。
    //   tipId（主）か PaymentIntent ID（従）で対象を特定。null の項目は既存値を維持（COALESCE）し、
    //   後続イベントで埋め直せるようにする（PI 直後は balance_transaction 未付与のことがある）。
    //   availableOn は postgres-js が Date を直接束縛できないため ISO 文字列＋timestamptz キャストで渡す。
    async saveTipChargeSettlement(params) {
      const db = getDb();
      const availableOnIso = params.availableOn ? params.availableOn.toISOString() : null;
      // tipId があれば tipId で、無ければ PaymentIntent ID で対象 tip を特定する
      if (params.tipId) {
        const rows = await db.execute<{ id: string }>(sql`
          UPDATE tip
          SET stripe_charge_id = COALESCE(${params.chargeId}, stripe_charge_id),
              balance_transaction_id = COALESCE(${params.balanceTransactionId}, balance_transaction_id),
              available_on = COALESCE(${availableOnIso}::timestamptz, available_on),
              bt_status = COALESCE(${params.btStatus}, bt_status)
          WHERE id = ${params.tipId}::uuid
          RETURNING id
        `);
        return rows.length;
      }
      if (params.paymentIntentId) {
        const rows = await db.execute<{ id: string }>(sql`
          UPDATE tip
          SET stripe_charge_id = COALESCE(${params.chargeId}, stripe_charge_id),
              balance_transaction_id = COALESCE(${params.balanceTransactionId}, balance_transaction_id),
              available_on = COALESCE(${availableOnIso}::timestamptz, available_on),
              bt_status = COALESCE(${params.btStatus}, bt_status)
          WHERE stripe_payment_intent_id = ${params.paymentIntentId}
          RETURNING id
        `);
        return rows.length;
      }
      return 0;
    },

    // (f) 返金・チャージバックで tip を refunded / disputed へ遷移する（残高・履歴・送金候補から除外）。
    //   charge ID（主）または PaymentIntent ID（従）で対象 tip を特定する。
    //   既に refunded/disputed なら更新しない（冪等）。遷移した tip の id・staff_id・amount を返す（台帳補正・逆引き用）。
    async applySettlementCorrectionToTip(params) {
      const db = getDb();
      // charge ID（主）/ PaymentIntent ID（従）のどちらかで照合する。両方無ければ対象なし。
      if (!params.chargeId && !params.paymentIntentId) {
        return null;
      }
      // 番兵: null だと = で一致しないため、照合に使わない側は影響しない（COALESCE で番兵化）
      const rows = await db.execute<{ tipId: string; staffId: string; amount: number }>(sql`
        UPDATE tip
        SET settlement_status = ${params.settlementStatus}
        WHERE (
            stripe_charge_id = ${params.chargeId}
            OR stripe_payment_intent_id = ${params.paymentIntentId}
          )
          AND settlement_status NOT IN ('refunded', 'disputed')
        RETURNING id AS "tipId", staff_id AS "staffId", amount AS "amount"
      `);
      return rows[0] ?? null;
    },
  };
}
