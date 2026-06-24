import { getDb, sql } from "@arigato/db";
import type { StoreInviteStatus } from "./store.model.js";

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
  // 導入承認に同意した日時（未同意は null。ISO 文字列）
  adoptionAgreedAt: string | null;
  // 店アカウントの所有者（Supabase auth.users の UUID。移行用の既存行は null）
  ownerAuthUserId: string | null;
};

// 店舗のセルフサーブ作成で Repository が受け取る値
export type CreateStoreParams = {
  // 作成者（＝所有者。Supabase auth.users の UUID）
  ownerAuthUserId: string;
  name: string;
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
  // 導入承認に同意した日時（作成時刻。ISO 文字列でなく Date を渡し SQL 側で now() でも可）
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
  // 誰宛かの任意メモ（発行時に入れた識別用ラベル。未入力は null）
  label: string | null;
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
  // 店舗をセルフサーブで新規作成する（作成者＝所有者・導入承認に同意済み）。作成した行を返す
  createStore: (params: CreateStoreParams) => Promise<StoreRow>;
  // 店プロフィールを更新する。更新後の行を返す
  updateStore: (storeId: string, params: UpdateStoreParams) => Promise<StoreRow | null>;
  // 招待を発行する（pending で新規作成）。label は誰宛かの任意メモ（未入力は null）。発行した招待行を返す
  createInvite: (storeId: string, code: string, label: string | null) => Promise<StoreInviteRow>;
  // 自店の招待中（pending）だけを新しい順に取得する（招待中一覧。accepted/revoked は返さない）
  listInvites: (storeId: string) => Promise<StoreInviteRow[]>;
  // 自店の招待 1 件を取得する（再コピー画面・取り消しの対象確認に使う）。見つからなければ null
  findInviteByCode: (storeId: string, code: string) => Promise<StoreInviteRow | null>;
  // 自店の招待中（pending）を失効（revoked）にする。更新できた件数を返す（0 なら対象なし）
  revokeInvite: (storeId: string, code: string) => Promise<number>;
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
  id                                                                                AS "id",
  name                                                                              AS "name",
  description                                                                       AS "description",
  industry                                                                          AS "industry",
  logo_url                                                                          AS "logoUrl",
  to_char(adoption_agreed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')      AS "adoptionAgreedAt",
  owner_auth_user_id                                                                AS "ownerAuthUserId"
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

    // 店舗をセルフサーブで新規作成する。作成者を所有者にし、導入承認の同意日時（now）を記録する。
    async createStore(params) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        INSERT INTO store (name, description, industry, logo_url, owner_auth_user_id, adoption_agreed_at)
        VALUES (
          ${params.name},
          ${params.description},
          ${params.industry},
          ${params.logoUrl},
          ${params.ownerAuthUserId},
          now()
        )
        RETURNING ${STORE_SELECT}
      `);
      return rows[0]!;
    },

    // 店プロフィールを更新する（名前・紹介・業種・ロゴ）。導入承認の同意は変更しない
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

    // 招待を発行する（pending で新規作成）。code は Service/Model で生成済みの一意トークン。
    // label は誰宛かの任意メモ（未入力は null で保存する）
    async createInvite(storeId, code, label) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        INSERT INTO staff_invite (store_id, code, status, label)
        VALUES (${storeId}, ${code}, 'pending', ${label})
        RETURNING
          code      AS "code",
          status    AS "status",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL      AS "acceptedStaffName",
          NULL      AS "acceptedAt",
          label     AS "label"
      `);
      return rows[0]!;
    },

    // 自店の招待中（pending）だけを新しい順に取得する。
    // accepted（在籍中タブに出る）・revoked（履歴管理しない）は二重表示を避けるため返さない。
    async listInvites(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.status      AS "status",
          to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL          AS "acceptedStaffName",
          NULL          AS "acceptedAt",
          i.label        AS "label"
        FROM staff_invite i
        WHERE i.store_id = ${storeId}
          AND i.status = 'pending'
        ORDER BY i.created_at DESC
      `);
      return rows;
    },

    // 自店の招待 1 件（pending）を取得する（再コピー画面・取り消しの対象確認）。pending 以外は対象外
    async findInviteByCode(storeId, code) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.status      AS "status",
          to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL          AS "acceptedStaffName",
          NULL          AS "acceptedAt",
          i.label        AS "label"
        FROM staff_invite i
        WHERE i.store_id = ${storeId}
          AND i.code = ${code}
          AND i.status = 'pending'
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 自店の招待中（pending）を失効（revoked）にする。自店・pending のみ更新し、件数を返す
    async revokeInvite(storeId, code) {
      const db = getDb();
      const rows = await db.execute<{ code: string }>(sql`
        UPDATE staff_invite
        SET status = 'revoked'
        WHERE store_id = ${storeId}
          AND code = ${code}
          AND status = 'pending'
        RETURNING code AS "code"
      `);
      return rows.length;
    },

    // 自店の所属スタッフを名簿順（在籍が古い順）で取得する（中立な並び・金額や件数では並べない）。
    // 多対多モデル: 所属は staff_store（membership）で表すため、staff_store 経由でこの店のメンバーを引く。
    // 並びは在籍（staff_store.created_at）が古い順にして、件数・金額では並べ替えない（中立）。
    async listStaff(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreStaffRow>(sql`
        SELECT
          s.id            AS "id",
          s.display_name  AS "displayName",
          s.headline      AS "headline",
          s.avatar_url    AS "avatarUrl"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        WHERE ss.store_id = ${storeId}
        ORDER BY ss.created_at ASC
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
    // COUNT のみで金額は扱わず、ORDER BY も在籍（名簿順）にして件数では並べ替えない（中立）。
    // 多対多モデル: この店のメンバー（staff_store）を引き、その店での成立済み tip だけを数える
    // （t.store_id でこの店分に限定するため、掛け持ちの他店分は混ざらない）。
    async listGratitudePerStaff(storeId) {
      const db = getDb();
      const rows = await db.execute<GratitudePerStaffRow>(sql`
        SELECT
          s.id            AS "staffId",
          s.display_name  AS "staffName",
          COUNT(t.id)::int AS "count"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        LEFT JOIN tip t
          ON t.staff_id = s.id
          AND t.store_id = ${storeId}
          AND t.status = 'succeeded'
        WHERE ss.store_id = ${storeId}
        GROUP BY s.id, s.display_name, ss.created_at
        ORDER BY ss.created_at ASC
      `);
      return rows;
    },
  };
}
