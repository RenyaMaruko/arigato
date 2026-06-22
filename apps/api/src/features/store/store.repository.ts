import { getDb, sql } from "@arigato/db";
import type { StoreStatus, StoreInviteStatus } from "./store.model.js";

/**
 * store feature の Repository 層（DB アクセス専用・生 SQL）。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼び出さない。
 *
 * 最重要原則: 店向けの取得経路では金額カラム（amount / customer_total / platform_fee）・
 * settlement_status（着金・残高）を一切 SELECT しない。感謝の集計は件数（COUNT）・メッセージ・
 * 受取日時・店員名だけを返す。これにより「店はお金に触れない」を Repository レベルで担保する。
 *
 * Repository を「インターフェース（StoreRepository）」として束ねて公開し、Service へ注入できる形にする。
 * これにより実 DB が無い環境でも Service をモック Repository でテストでき、契約を確認可能にする。
 */

// 店プロフィール行（金額・残高は持たない）
export type StoreRow = {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
  status: StoreStatus;
  // 承認日時（未承認は null。ISO 文字列）
  approvedAt: string | null;
  // 店アカウントの所有者（Supabase auth.users の UUID。未紐付けは null）
  ownerAuthUserId: string | null;
};

// 招待行（招待中一覧・発行結果に使う）
export type StoreInviteRow = {
  code: string;
  status: StoreInviteStatus;
  // 発行日時（ISO 文字列）
  createdAt: string;
  // 消費して所属した店員さんの表示名（未消費は null）
  acceptedStaffName: string | null;
  // 消費（所属確定）日時（未消費は null。ISO 文字列）
  acceptedAt: string | null;
};

// 所属スタッフ行（在籍管理。金額・件数のランキングは持たない）
export type StoreStaffRow = {
  id: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
};

// 感謝の「お客さまの声」1件分（金額なし）
export type GratitudeVoiceRow = {
  id: string;
  message: string;
  // 受け取った日時（ISO 文字列・UTC）
  receivedAt: string;
  // 誰宛か（受け取った店員さんの表示名）
  staffName: string;
};

// 感謝集計に使う、成立済み投げ銭の受取日時だけ（金額は取得しない）
export type GratitudeTimeRow = {
  // 受け取った日時（ISO 文字列・UTC）
  receivedAt: string;
};

// スタッフ別の「ありがとう件数」（件数のみ・金額なし）
export type GratitudePerStaffRow = {
  staffId: string;
  staffName: string;
  // この店員さんに届いた件数（COUNT）。金額ではない
  count: number;
};

// 店プロフィール更新で Repository が受け取る値
export type UpdateStoreParams = {
  name: string;
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
};

/**
 * Service が依存する Repository の契約（注入点）。
 * 実装は下の createStoreRepository（実 DB）。テストではこの型を満たすモックを渡す。
 */
export type StoreRepository = {
  // 店プロフィールを取得する（店スコープのアクセス制御に owner も併せて返す）
  findStoreById: (storeId: string) => Promise<StoreRow | null>;
  // 所有者（auth ユーザー）から自店を取得する（店ホーム・設定の起点）
  findStoreByOwner: (authUserId: string) => Promise<StoreRow | null>;
  // 未所有の店に所有者を紐付ける（導入セットアップ）。
  // 既に別の所有者がいる行は更新しない（横取り防止）。紐付けできなければ null
  setStoreOwner: (storeId: string, authUserId: string) => Promise<StoreRow | null>;
  // 店を承認する（pending→approved・approved_at 設定）。承認後の行を返す。既に approved なら据え置く（冪等）
  approveStore: (storeId: string) => Promise<StoreRow | null>;
  // 店プロフィールを更新する。更新後の行を返す
  updateStore: (storeId: string, params: UpdateStoreParams) => Promise<StoreRow | null>;
  // 招待を発行する（pending で新規作成）。発行した招待行を返す
  createInvite: (storeId: string, code: string) => Promise<StoreInviteRow>;
  // 自店の招待を新しい順に取得する（招待中一覧）
  listInvites: (storeId: string) => Promise<StoreInviteRow[]>;
  // 自店の所属スタッフを名簿順（在籍が古い順）で取得する（在籍管理。中立な並び）
  listStaff: (storeId: string) => Promise<StoreStaffRow[]>;
  // 自店宛の「お客さまの声」（メッセージのある成立済み投げ銭）を新しい順に取得する（金額なし）
  listGratitudeVoices: (storeId: string, limit: number) => Promise<GratitudeVoiceRow[]>;
  // 自店宛の成立済み投げ銭の受取日時だけを取得する（件数集計用・金額なし）
  listGratitudeTimes: (storeId: string) => Promise<GratitudeTimeRow[]>;
  // 自店のスタッフ別「ありがとう件数」を名簿順（中立）で取得する（金額なし・件数で並べ替えない）
  listGratitudePerStaff: (storeId: string) => Promise<GratitudePerStaffRow[]>;
};

// 共通の SELECT 句（店プロフィール行。金額・残高カラムは一切含めない）
const STORE_SELECT = sql`
  id                                                                          AS "id",
  name                                                                        AS "name",
  description                                                                 AS "description",
  industry                                                                    AS "industry",
  logo_url                                                                    AS "logoUrl",
  status                                                                      AS "status",
  to_char(approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')       AS "approvedAt",
  owner_auth_user_id                                                          AS "ownerAuthUserId"
`;

/**
 * 実 DB（Drizzle / postgres-js）に対する Repository 実装を生成する。
 * 生 SQL はここに集約する。getDb() は遅延接続のため、呼ばれて初めて DB へつなぐ。
 */
export function createStoreRepository(): StoreRepository {
  return {
    // 店プロフィールを取得する（所有者も併せて返し、Service でアクセス制御に使う）
    async findStoreById(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        SELECT ${STORE_SELECT}
        FROM store
        WHERE id = ${storeId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 所有者（auth ユーザー）から自店を取得する（店ホーム・設定の起点）
    async findStoreByOwner(authUserId) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        SELECT ${STORE_SELECT}
        FROM store
        WHERE owner_auth_user_id = ${authUserId}
        ORDER BY created_at ASC
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 未所有の店に所有者を紐付ける（導入セットアップ）。
    // WHERE owner_auth_user_id IS NULL OR = 自分 のときだけ更新し、他者所有の横取りを防ぐ。
    async setStoreOwner(storeId, authUserId) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        UPDATE store
        SET owner_auth_user_id = ${authUserId}
        WHERE id = ${storeId}
          AND (owner_auth_user_id IS NULL OR owner_auth_user_id = ${authUserId})
        RETURNING ${STORE_SELECT}
      `);
      return rows[0] ?? null;
    },

    // 店を承認する（pending→approved）。承認日時を設定する。
    // 既に approved の場合は approved_at を据え置き（COALESCE）にして冪等にする。
    async approveStore(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        UPDATE store
        SET status = 'approved',
            approved_at = COALESCE(approved_at, now())
        WHERE id = ${storeId}
        RETURNING ${STORE_SELECT}
      `);
      return rows[0] ?? null;
    },

    // 店プロフィールを更新する（名前・紹介・業種・ロゴ）。ステータス・承認は変更しない
    async updateStore(storeId, params) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        UPDATE store
        SET name = ${params.name},
            description = ${params.description},
            industry = ${params.industry},
            logo_url = ${params.logoUrl}
        WHERE id = ${storeId}
        RETURNING ${STORE_SELECT}
      `);
      return rows[0] ?? null;
    },

    // 招待を発行する（pending で新規作成）。code は Service/Model で生成済みの一意トークン
    async createInvite(storeId, code) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        INSERT INTO staff_invite (store_id, code, status)
        VALUES (${storeId}, ${code}, 'pending')
        RETURNING
          code      AS "code",
          status    AS "status",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL      AS "acceptedStaffName",
          NULL      AS "acceptedAt"
      `);
      return rows[0]!;
    },

    // 自店の招待を新しい順に取得する。消費済みなら所属した店員名・消費日時も結合する
    async listInvites(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.status      AS "status",
          to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          s.display_name AS "acceptedStaffName",
          to_char(i.accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')  AS "acceptedAt"
        FROM staff_invite i
        LEFT JOIN staff s ON s.id = i.accepted_staff_id
        WHERE i.store_id = ${storeId}
        ORDER BY i.created_at DESC
      `);
      return rows;
    },

    // 自店の所属スタッフを名簿順（在籍が古い順）で取得する（中立な並び・金額や件数では並べない）
    async listStaff(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreStaffRow>(sql`
        SELECT
          id            AS "id",
          display_name  AS "displayName",
          headline      AS "headline",
          avatar_url    AS "avatarUrl"
        FROM staff
        WHERE store_id = ${storeId}
        ORDER BY created_at ASC
      `);
      return rows;
    },

    // 自店宛の「お客さまの声」を新しい順に取得する（メッセージのある成立済みのみ・金額は SELECT しない）
    async listGratitudeVoices(storeId, limit) {
      const db = getDb();
      const rows = await db.execute<GratitudeVoiceRow>(sql`
        SELECT
          t.id          AS "id",
          t.message     AS "message",
          to_char(COALESCE(t.succeeded_at, t.created_at) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "receivedAt",
          s.display_name AS "staffName"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        WHERE t.store_id = ${storeId}
          AND t.status = 'succeeded'
          AND t.message IS NOT NULL
          AND btrim(t.message) <> ''
        ORDER BY COALESCE(t.succeeded_at, t.created_at) DESC
        LIMIT ${limit}
      `);
      return rows;
    },

    // 自店宛の成立済み投げ銭の受取日時だけを取得する（件数集計用・金額は SELECT しない）
    async listGratitudeTimes(storeId) {
      const db = getDb();
      const rows = await db.execute<GratitudeTimeRow>(sql`
        SELECT
          to_char(COALESCE(t.succeeded_at, t.created_at) AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "receivedAt"
        FROM tip t
        WHERE t.store_id = ${storeId}
          AND t.status = 'succeeded'
      `);
      return rows;
    },

    // 自店のスタッフ別「ありがとう件数」を名簿順（在籍が古い順）で取得する。
    // COUNT のみで金額は扱わず、ORDER BY も created_at（名簿順）にして件数では並べ替えない（中立）。
    async listGratitudePerStaff(storeId) {
      const db = getDb();
      const rows = await db.execute<GratitudePerStaffRow>(sql`
        SELECT
          s.id            AS "staffId",
          s.display_name  AS "staffName",
          COUNT(t.id)::int AS "count"
        FROM staff s
        LEFT JOIN tip t
          ON t.staff_id = s.id
          AND t.status = 'succeeded'
        WHERE s.store_id = ${storeId}
        GROUP BY s.id, s.display_name, s.created_at
        ORDER BY s.created_at ASC
      `);
      return rows;
    },
  };
}
