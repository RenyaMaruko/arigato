import { getDb, sql } from "@arigato/db";
import type { Stamp, TipStatus, SettlementStatus } from "@arigato/shared";

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
};

// tip を保存する際に Repository が受け取る値（全カラムを明示）
export type InsertTipParams = {
  staffId: string;
  storeId: string;
  amount: number;
  platformFee: number;
  customerTotal: number;
  message: string | null;
  stamp: Stamp | null;
  status: TipStatus;
  settlementStatus: SettlementStatus;
  stripePaymentIntentId: string | null;
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
  stamp: Stamp | null;
  status: TipStatus;
  settlementStatus: SettlementStatus;
};

/**
 * Service が依存する Repository の契約（注入点）。
 * 実装は下の createTipRepository（実 DB）。テストではこの型を満たすモックを渡す。
 */
export type TipRepository = {
  // 投げ銭画面の表示情報（staff の名前・一言・顔写真＋所属店名）を取得
  findStaffDisplay: (staffId: string) => Promise<StaffDisplayRow | null>;
  // tip を1件保存し、保存された行を返す
  insertTip: (params: InsertTipParams) => Promise<TipRow>;
  // tip を ID で取得（完了画面の再掲に使う）
  findTipById: (tipId: string) => Promise<TipRow | null>;
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
          s.id           AS "staffId",
          s.display_name AS "displayName",
          s.headline     AS "headline",
          s.avatar_url   AS "avatarUrl",
          st.id          AS "storeId",
          st.name        AS "storeName"
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
          message, stamp, status, settlement_status,
          stripe_payment_intent_id, succeeded_at
        ) VALUES (
          ${params.staffId}, ${params.storeId}, ${params.amount},
          ${params.platformFee}, ${params.customerTotal},
          ${params.message}, ${params.stamp}, ${params.status},
          ${params.settlementStatus}, ${params.stripePaymentIntentId},
          ${params.status === "succeeded" ? sql`now()` : sql`NULL`}
        )
        RETURNING
          id, staff_id AS "staffId", store_id AS "storeId",
          amount, platform_fee AS "platformFee", customer_total AS "customerTotal",
          message, stamp, status, settlement_status AS "settlementStatus"
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
          message, stamp, status, settlement_status AS "settlementStatus"
        FROM tip
        WHERE id = ${tipId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },
  };
}
