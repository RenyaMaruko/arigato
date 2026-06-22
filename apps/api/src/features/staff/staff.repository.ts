import { getDb, sql } from "@arigato/db";
import type {
  IdentityStatus,
  InviteStatus,
  StoreStatus,
  SettlementStatus,
} from "./staff.model.js";

/**
 * staff feature の Repository 層（DB アクセス専用・生 SQL）。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼び出さない。
 *
 * Repository を「インターフェース（StaffRepository）」として束ねて公開し、Service へ注入できる形にする。
 * これにより実 DB が無い環境でも Service をモック Repository でテストでき、契約を確認可能にする。
 */

// 招待検証で返す行（招待＋発行元の店情報）
export type InviteRow = {
  code: string;
  storeId: string;
  storeName: string;
  inviteStatus: InviteStatus;
  storeStatus: StoreStatus;
};

// プロフィール取得（GET /staff/me）で返す行（staff＋所属店）
export type StaffProfileRow = {
  id: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  storeId: string;
  storeName: string;
  identityStatus: IdentityStatus;
};

// プロフィール作成時に Repository が受け取る値
export type InsertStaffParams = {
  authUserId: string;
  storeId: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
};

// Connect オンボーディング時に必要な、本人の Stripe 連携状態
export type StaffConnectRow = {
  id: string;
  displayName: string;
  // 既存の Connected Account（未連携は null）
  stripeAccountId: string | null;
  identityStatus: IdentityStatus;
};

// 受取履歴1件分（本人のみ・金額を含む）
export type StaffTipRow = {
  id: string;
  amount: number;
  message: string | null;
  // 受取日時（決済成立日時。ISO 文字列）
  receivedAt: string;
  storeName: string;
  settlementStatus: SettlementStatus;
};

// 保留残高サマリの集計に使う成立済み tip の最小情報（本人のみ）
export type SettlementRow = {
  amount: number;
  settlementStatus: SettlementStatus;
};

// 申告データ CSV 用の受取記録（本人のみ）
export type TaxReportRecord = {
  // 受取日（YYYY-MM-DD）
  receivedDate: string;
  amount: number;
  storeName: string;
};

// account.updated 反映の結果（本人確認の遷移と held→payable の遷移件数）
export type ApplyAccountUpdateResult = {
  // 対象 staff が見つかったか
  found: boolean;
  // この更新で identity_status が verified に確定したか
  verified: boolean;
  // held から payable に遷移した tip の件数
  promotedTips: number;
};

/**
 * Service が依存する Repository の契約（注入点）。
 * 実装は下の createStaffRepository（実 DB）。テストではこの型を満たすモックを渡す。
 */
export type StaffRepository = {
  // 招待コードから招待＋発行元の店情報を取得（招待検証・所属確定の起点）
  findInviteByCode: (code: string) => Promise<InviteRow | null>;
  // auth ユーザーIDから自分の staff プロフィールを取得（GET /staff/me / 重複作成防止）
  findStaffByAuthUserId: (authUserId: string) => Promise<StaffProfileRow | null>;
  // 招待を消費して staff を作成する（招待 accepted 化と staff INSERT をまとめて行う）。
  // 作成された staff のプロフィール行を返す。
  createStaffWithInvite: (code: string, params: InsertStaffParams) => Promise<StaffProfileRow>;
  // 自分のプロフィール（display_name・headline・avatar）を更新する。更新後の行を返す
  updateStaffProfile: (
    authUserId: string,
    params: { displayName: string; headline: string | null; avatarUrl: string | null },
  ) => Promise<StaffProfileRow | null>;
  // 本人の Connect 連携状態（Connected Account・identity_status）を取得（オンボーディングの起点）
  findStaffConnect: (authUserId: string) => Promise<StaffConnectRow | null>;
  // 新規作成した Connected Account を本人の staff に保存する（オンボーディング開始時に1度だけ）
  setStripeAccountId: (authUserId: string, stripeAccountId: string) => Promise<void>;
  // 本人の受取履歴（成立済み）を新しい順に取得する（金額・メッセージ含む・本人のみ）
  listTipsByAuthUserId: (authUserId: string) => Promise<StaffTipRow[]>;
  // 本人の保留残高集計に使う、成立済み tip の settlement 状態と金額を取得する（本人のみ）
  listSettlementsByAuthUserId: (authUserId: string) => Promise<SettlementRow[]>;
  // 本人の申告データ（受取記録）を年で絞って取得する（本人のみ）。year は西暦
  listTaxRecordsByAuthUserId: (authUserId: string, year: number) => Promise<TaxReportRecord[]>;
  // account.updated を反映する。Connected Account ID で本人を引き、
  // payouts_enabled=true なら identity_status を verified に確定し、held の tip を payable へ遷移する。
  // 1トランザクションで原子的に行い、二重遷移しない（既に verified なら tip も再遷移しない）。
  applyAccountUpdate: (
    stripeAccountId: string,
    payoutsEnabled: boolean,
  ) => Promise<ApplyAccountUpdateResult>;
};

/**
 * 実 DB（Drizzle / postgres-js）に対する Repository 実装を生成する。
 * 生 SQL はここに集約する。getDb() は遅延接続のため、呼ばれて初めて DB へつなぐ。
 */
export function createStaffRepository(): StaffRepository {
  return {
    // 招待コードで招待を引き、発行元の店名・店ステータスも併せて取得する
    async findInviteByCode(code) {
      const db = getDb();
      const rows = await db.execute<InviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.store_id    AS "storeId",
          st.name       AS "storeName",
          i.status      AS "inviteStatus",
          st.status     AS "storeStatus"
        FROM staff_invite i
        JOIN store st ON st.id = i.store_id
        WHERE i.code = ${code}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // auth ユーザーIDで自分の staff プロフィールを取得（所属店名も結合）
    async findStaffByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<StaffProfileRow>(sql`
        SELECT
          s.id              AS "id",
          s.display_name    AS "displayName",
          s.headline        AS "headline",
          s.avatar_url      AS "avatarUrl",
          s.store_id        AS "storeId",
          st.name           AS "storeName",
          s.identity_status AS "identityStatus"
        FROM staff s
        JOIN store st ON st.id = s.store_id
        WHERE s.auth_user_id = ${authUserId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 招待を消費して staff を作成する。
    // 招待の二重消費を防ぐため、招待を pending→accepted に確定できた場合のみ staff を作る
    // （楽観ロック相当。WHERE status='pending' で更新できた件数が 0 なら使用済み）。
    // staff 作成と招待消費は1トランザクションで原子的に行う。
    async createStaffWithInvite(code, params) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // staff を作成（store_id は招待で確定済みの値を渡す）
        const inserted = await tx.execute<{ id: string }>(sql`
          INSERT INTO staff (auth_user_id, store_id, display_name, headline, avatar_url)
          VALUES (${params.authUserId}, ${params.storeId}, ${params.displayName},
                  ${params.headline}, ${params.avatarUrl})
          RETURNING id
        `);
        const staffId = inserted[0]!.id;

        // 招待を消費（pending のときのみ accepted へ。二重消費はここで弾く）
        const accepted = await tx.execute<{ id: string }>(sql`
          UPDATE staff_invite
          SET status = 'accepted',
              accepted_staff_id = ${staffId},
              accepted_at = now()
          WHERE code = ${code}
            AND status = 'pending'
          RETURNING id
        `);
        if (accepted.length === 0) {
          // 既に消費済み/失効 → トランザクションを巻き戻して staff 作成も取り消す
          throw new Error("invite_not_usable");
        }

        // 作成した staff のプロフィール行を返す
        const rows = await tx.execute<StaffProfileRow>(sql`
          SELECT
            s.id              AS "id",
            s.display_name    AS "displayName",
            s.headline        AS "headline",
            s.avatar_url      AS "avatarUrl",
            s.store_id        AS "storeId",
            st.name           AS "storeName",
            s.identity_status AS "identityStatus"
          FROM staff s
          JOIN store st ON st.id = s.store_id
          WHERE s.id = ${staffId}
          LIMIT 1
        `);
        return rows[0]!;
      });
    },

    // 自分のプロフィールを更新（所属・招待は変更しない）。本人の auth_user_id で限定する
    async updateStaffProfile(authUserId, params) {
      const db = getDb();
      const rows = await db.execute<StaffProfileRow>(sql`
        UPDATE staff s
        SET display_name = ${params.displayName},
            headline = ${params.headline},
            avatar_url = ${params.avatarUrl}
        FROM store st
        WHERE s.auth_user_id = ${authUserId}
          AND st.id = s.store_id
        RETURNING
          s.id              AS "id",
          s.display_name    AS "displayName",
          s.headline        AS "headline",
          s.avatar_url      AS "avatarUrl",
          s.store_id        AS "storeId",
          st.name           AS "storeName",
          s.identity_status AS "identityStatus"
      `);
      return rows[0] ?? null;
    },

    // 本人の Connect 連携状態（Connected Account・identity_status）を取得（オンボーディングの起点）
    async findStaffConnect(authUserId) {
      const db = getDb();
      const rows = await db.execute<StaffConnectRow>(sql`
        SELECT
          id                AS "id",
          display_name      AS "displayName",
          stripe_account_id AS "stripeAccountId",
          identity_status   AS "identityStatus"
        FROM staff
        WHERE auth_user_id = ${authUserId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 新規作成した Connected Account を本人の staff に保存する（本人スコープで限定）
    async setStripeAccountId(authUserId, stripeAccountId) {
      const db = getDb();
      await db.execute(sql`
        UPDATE staff
        SET stripe_account_id = ${stripeAccountId}
        WHERE auth_user_id = ${authUserId}
      `);
    },

    // 本人の受取履歴（成立済み）を新しい順に取得する（金額・メッセージ含む・本人のみ）。
    // 自分の auth_user_id をキーに staff を結合し、他人の行は決して返さない。
    async listTipsByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<StaffTipRow>(sql`
        SELECT
          t.id                AS "id",
          t.amount            AS "amount",
          t.message           AS "message",
          to_char(COALESCE(t.succeeded_at, t.created_at) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "receivedAt",
          st.name             AS "storeName",
          t.settlement_status AS "settlementStatus"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        JOIN store st ON st.id = t.store_id
        WHERE s.auth_user_id = ${authUserId}
          AND t.status = 'succeeded'
        ORDER BY COALESCE(t.succeeded_at, t.created_at) DESC
      `);
      return rows;
    },

    // 本人の保留残高集計に使う、成立済み tip の settlement 状態と金額を取得する（本人のみ）
    async listSettlementsByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<SettlementRow>(sql`
        SELECT
          t.amount            AS "amount",
          t.settlement_status AS "settlementStatus"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        WHERE s.auth_user_id = ${authUserId}
          AND t.status = 'succeeded'
      `);
      return rows;
    },

    // 本人の申告データ（受取記録）を年で絞って取得する（本人のみ）。受取日時の年で絞る。
    async listTaxRecordsByAuthUserId(authUserId, year) {
      const db = getDb();
      const rows = await db.execute<TaxReportRecord>(sql`
        SELECT
          to_char(COALESCE(t.succeeded_at, t.created_at) AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')
                              AS "receivedDate",
          t.amount            AS "amount",
          st.name             AS "storeName"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        JOIN store st ON st.id = t.store_id
        WHERE s.auth_user_id = ${authUserId}
          AND t.status = 'succeeded'
          AND EXTRACT(YEAR FROM (COALESCE(t.succeeded_at, t.created_at) AT TIME ZONE 'Asia/Tokyo')) = ${year}
        ORDER BY COALESCE(t.succeeded_at, t.created_at) ASC
      `);
      return rows;
    },

    // account.updated を反映する。Connected Account ID で本人を引き、payouts_enabled=true なら
    // identity_status を verified に確定し、held の tip を payable へ遷移する。
    // 既に verified なら tip も再遷移しない（二重遷移の防止）。1トランザクションで原子的に行う。
    async applyAccountUpdate(stripeAccountId, payoutsEnabled) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 対象 staff を取得（行ロックで競合を避ける）
        const found = await tx.execute<{ id: string; identityStatus: IdentityStatus }>(sql`
          SELECT id AS "id", identity_status AS "identityStatus"
          FROM staff
          WHERE stripe_account_id = ${stripeAccountId}
          LIMIT 1
          FOR UPDATE
        `);
        const staffRow = found[0];
        if (!staffRow) {
          return { found: false, verified: false, promotedTips: 0 };
        }

        // まだ着金可能でなければ verified への遷移はしない（pending へは寄せず据え置く）。
        // ここでは「verified になったか」だけを着金遷移の起点にする。
        if (!payoutsEnabled) {
          return { found: true, verified: staffRow.identityStatus === "verified", promotedTips: 0 };
        }

        // 既に verified なら二重遷移しない（冪等。tip も再遷移させない）
        if (staffRow.identityStatus === "verified") {
          return { found: true, verified: true, promotedTips: 0 };
        }

        // identity_status を verified に確定する
        await tx.execute(sql`
          UPDATE staff
          SET identity_status = 'verified'
          WHERE id = ${staffRow.id}
        `);

        // この店員さんの held の tip を payable（着金可能）へ遷移する
        const promoted = await tx.execute<{ id: string }>(sql`
          UPDATE tip
          SET settlement_status = 'payable'
          WHERE staff_id = ${staffRow.id}
            AND settlement_status = 'held'
          RETURNING id
        `);

        return { found: true, verified: true, promotedTips: promoted.length };
      });
    },
  };
}
