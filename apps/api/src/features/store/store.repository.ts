import { getDb, sql } from "@arigato/db";
import type { StoreInviteStatus, StoreInviteType, StoreRole } from "./store.model.js";

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
  // 店の論理削除（閉店）日時（営業中は null。ISO 文字列）
  closedAt: string | null;
};

// 店舗のセルフサーブ作成で Repository が受け取る値
export type CreateStoreParams = {
  // 作成者（＝作成と同時に store_admin(role=owner) 行を作る所有者。Supabase auth.users の UUID）
  creatorAuthUserId: string;
  name: string;
  description: string | null;
  industry: string | null;
  logoUrl: string | null;
  // 導入承認に同意した日時（作成時刻。ISO 文字列でなく Date を渡し SQL 側で now() でも可）
};

// store_admin（店舗の管理者）1件。owner 継承・譲渡・管理者判定に使う（金額は持たない）
export type StoreAdminRow = {
  // 管理者の人（Supabase auth.users の UUID）
  authUserId: string;
  role: StoreRole;
  // その店に管理者として加わった日時（ISO 文字列。最古参判定に使う）
  createdAt: string;
};

// 自分が管理する店の一覧の1件（GET /store/mine・§11.4）。金額は持たない。
// id/名前/ロゴ/自分のロールだけを返し、中央ナビの切替（1件直行/複数一覧）に使う。
export type StoreManagedRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  role: StoreRole;
};

// 管理者一覧の1件（表示用）。store_admin に staff プロフィール（表示名・顔写真）を左結合して返す。
// staff プロフィール未作成の管理者もあり得るため displayName / avatarUrl は null 可（金額は持たない）。
export type StoreAdminListRow = {
  authUserId: string;
  role: StoreRole;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

// 招待行（招待中一覧・発行結果に使う）
export type StoreInviteRow = {
  code: string;
  status: StoreInviteStatus;
  // 招待の種類（staff: スタッフ招待 / admin: 管理者招待）。招待中タブで種類ラベルを出す
  type: StoreInviteType;
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
  // その人の auth ユーザーID（一覧の「（自分）」表示の判定用）。メモリ実装では省略可
  authUserId?: string | null;
};

// 在籍中スタッフ1人の詳細行（店スコープ・金額なし）。参加日は staff_store.created_at。
export type StoreStaffDetailRow = {
  id: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  // その店に参加した日時（staff_store.created_at。ISO 文字列）
  joinedAt: string;
  // その店での所属（staff_store＝membership）の ID。QR が指す固定 URL（/tip/:membershipId）の元
  membershipId: string;
  // 対象スタッフの人（Supabase auth.users の UUID）。管理者操作の対象特定に使う
  authUserId: string;
  // その人のこの店での active な管理者ロール（owner/admin）。管理者でなければ null（出し分け用）
  role: StoreRole | null;
};

// 感謝の「お客さまの声」1件分（金額なし）
export type GratitudeVoiceRow = {
  id: string;
  // メッセージは無い投げ銭もあるため null 可（フロントで「メッセージなし」と表示）
  message: string | null;
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
  // スタッフのアバター画像URL（公開URL）。未設定は null
  avatarUrl: string | null;
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
// 感謝の可視化の期間フィルタ（from は含む・>=、to は排他・<。ISO 文字列。未指定はその端をフィルタしない）。
// COALESCE(succeeded_at, created_at) を受取日時として WHERE に AND する。
export type GratitudePeriodFilter = {
  from?: string;
  to?: string;
};

export type StoreRepository = {
  // 店プロフィールを取得する（店スコープのアクセス制御・閉店判定に closedAt も併せて返す）
  findStoreById: (storeId: string) => Promise<StoreRow | null>;
  // 自分（auth ユーザー）が active な管理者（store_admin）である店を取得する（店ホーム・設定の起点）。
  // owner を優先し、次に古参順で1件返す。閉店（closed_at）店は除外する（フェーズ2は1店の一般ケース）。
  findStoreForAdmin: (authUserId: string) => Promise<StoreRow | null>;
  // 自分（auth ユーザー）が active な管理者（owner/admin）である営業中の店を全件返す（GET /store/mine・§11.4）。
  // owner を先頭に、その後 admin を古参順（created_at 昇順）で返す。閉店（closed_at）店は除外する。
  // 金額は含めず、中央ナビの切替（1件直行/複数一覧）の選択肢として使う。
  listManagedStores: (authUserId: string) => Promise<StoreManagedRow[]>;
  // 店舗をセルフサーブで新規作成し、同時に作成者を owner（store_admin role=owner）にする（1トランザクション）。
  // 作成した店行を返す（導入承認に同意済み）。
  createStoreWithOwner: (params: CreateStoreParams) => Promise<StoreRow>;
  // その店における auth ユーザーの active な管理者ロール（owner/admin）を返す。管理者でなければ null。
  // 権限チェック（requireStoreAdmin / requireStoreOwner）の中核。
  findActiveAdminRole: (storeId: string, authUserId: string) => Promise<StoreRole | null>;
  // その店の active な管理者一覧を古参順（created_at 昇順）で返す（owner 継承・譲渡の判定に使う）。
  listActiveAdmins: (storeId: string) => Promise<StoreAdminRow[]>;
  // その店の active な管理者一覧を表示用（staff プロフィールの表示名・顔写真を左結合）で返す。
  // owner を先頭に、その後 admin を古参順で返す（管理者管理 UI の一覧・owner 譲渡の指名に使う）。
  listAdminsForDisplay: (storeId: string) => Promise<StoreAdminListRow[]>;
  // その店の active な管理者(admin)1人を論理削除（left_at=now）する（owner が管理者を外す）。
  // owner は対象外（role='admin' のみ）。外せた件数を返す（0 なら active な admin でない）。
  removeAdmin: (storeId: string, authUserId: string) => Promise<number>;
  // 自分（auth ユーザー）が active な管理者である営業中の店が1つ以上あるかを返す（モード切替の判定）。
  // 兼任者（店員かつ管理者）だけに「店の管理へ」を出すために使う。
  hasManagedStore: (authUserId: string) => Promise<boolean>;
  // その店の管理者1人を論理削除（left_at=now）する（owner 離脱・消失の起点）。外せた件数を返す。
  leaveAdmin: (storeId: string, authUserId: string) => Promise<number>;
  // その店の active な管理者(admin)1人を owner へ昇格する（自動継承）。昇格できた件数を返す。
  // 呼び出し側は事前に現 owner を離脱させ、owner が1人不在の状態で呼ぶこと（部分ユニーク制約を守る）。
  promoteAdminToOwner: (storeId: string, authUserId: string) => Promise<number>;
  // owner を譲渡する（1トランザクション）。現 owner(from)→admin、対象 admin(to)→owner。
  // owner が1人である不変条件を保つため、demote→promote を同一トランザクションで行う。
  transferOwner: (storeId: string, fromAuthUserId: string, toAuthUserId: string) => Promise<void>;
  // 店を論理削除（閉店）する（1トランザクション）。store.closed_at をセットし、
  // その店の在籍中 staff_store（所属＝QR）を無効化（left_at=now）、active な store_admin も外す。
  // 受取記録・資金（tip）は保全（物理削除しない）。閉店できたら店行、既に閉店・無しなら null。
  closeStore: (storeId: string) => Promise<StoreRow | null>;
  // 店プロフィールを更新する。更新後の行を返す
  updateStore: (storeId: string, params: UpdateStoreParams) => Promise<StoreRow | null>;
  // 自店のロゴ画像URL（公開URL）を更新する（画像アップロード後・店スコープ）
  setLogoUrl: (storeId: string, logoUrl: string) => Promise<void>;
  // スタッフ招待を発行する（type='staff'・pending で新規作成）。label は誰宛かの任意メモ（未入力は null）。
  createInvite: (storeId: string, code: string, label: string | null) => Promise<StoreInviteRow>;
  // 管理者招待を発行する（type='admin'・pending で新規作成）。owner のみが発行できる（権限は Service で確認）。
  // 受け入れると store_admin role=admin を作る（受け入れ分岐は staff feature 側）。発行した招待行を返す。
  createAdminInvite: (
    storeId: string,
    code: string,
    label: string | null,
  ) => Promise<StoreInviteRow>;
  // 自店の招待中（pending）だけを新しい順に取得する（招待中一覧。accepted/revoked は返さない）
  listInvites: (storeId: string) => Promise<StoreInviteRow[]>;
  // 自店の招待 1 件を取得する（再コピー画面・取り消しの対象確認に使う）。見つからなければ null
  findInviteByCode: (storeId: string, code: string) => Promise<StoreInviteRow | null>;
  // 自店の招待中（pending）を失効（revoked）にする。更新できた件数を返す（0 なら対象なし）
  revokeInvite: (storeId: string, code: string) => Promise<number>;
  // 自店の所属スタッフを名簿順（在籍が古い順）で取得する（在籍管理。中立な並び）。
  // 在籍中（left_at IS NULL）のみ返す（脱退・在籍解除済みは外れる）。
  listStaff: (storeId: string) => Promise<StoreStaffRow[]>;
  // 自店の在籍中スタッフ1人の詳細（表示名・一言・顔写真・参加日）を取得する（店スコープ・金額なし）。
  // 在籍中（left_at IS NULL）のみ対象。見つからない（他店・脱退済み・存在しない）なら null。
  findStaffDetail: (storeId: string, staffId: string) => Promise<StoreStaffDetailRow | null>;
  // 自店のスタッフを在籍解除する（論理削除）。その (staff,store) の membership に left_at=now() を立てる。
  // 在籍中（left_at IS NULL）のみ対象。物理削除しない（tip の履歴を保持）。解除できた件数を返す。
  removeStaff: (storeId: string, staffId: string) => Promise<number>;
  // 自店宛の「お客さまの声」（成立済み投げ銭）を新しい順に取得する（金額なし）。
  // period（from/to）を渡すとその期間に絞る（未指定は全期間）。
  // staffId を渡すと、その店員さん宛の声だけに絞る（未指定は全スタッフ・スタッフ別タブの「特定スタッフ」用）。
  listGratitudeVoices: (
    storeId: string,
    limit: number,
    period?: GratitudePeriodFilter,
    staffId?: string,
  ) => Promise<GratitudeVoiceRow[]>;
  // 自店宛の成立済み投げ銭の受取日時だけを取得する（件数集計用・金額なし）。
  // 期間で絞らず全期間を返す（totalCount の期間絞り込みと weekCount の常時今週は Model 側で算出する）。
  listGratitudeTimes: (storeId: string) => Promise<GratitudeTimeRow[]>;
  // 自店のスタッフ別「ありがとう件数」を名簿順（中立）で取得する（金額なし・件数で並べ替えない）。
  // period（from/to）を渡すとその期間に絞る（未指定は全期間）。
  listGratitudePerStaff: (
    storeId: string,
    period?: GratitudePeriodFilter,
  ) => Promise<GratitudePerStaffRow[]>;
};

/**
 * 感謝の可視化の期間フィルタ（from/to）を SQL の AND 条件に変換するヘルパ。
 * 受取日時 = COALESCE(succeeded_at, created_at)。from は含む（>=）・to は排他（<）。
 * 未指定の端は条件を足さない（全期間）。生 SQL は Repository 内に閉じる。
 */
function gratitudePeriodClause(period?: GratitudePeriodFilter) {
  const parts = [];
  // from: その時刻を含む（>=）
  if (period?.from) {
    parts.push(sql`AND COALESCE(t.succeeded_at, t.created_at) >= ${period.from}`);
  }
  // to: その時刻を含まない（<・排他）
  if (period?.to) {
    parts.push(sql`AND COALESCE(t.succeeded_at, t.created_at) < ${period.to}`);
  }
  // 条件が無ければ空フラグメント（全期間）
  return parts.length > 0 ? sql.join(parts, sql` `) : sql``;
}

// 共通の SELECT 句（店プロフィール行。金額・残高カラムは一切含めない）。
// owner 表現は store_admin(role=owner) へ移行したため owner カラムは SELECT しない。
const STORE_SELECT = sql`
  id                                                                                AS "id",
  name                                                                              AS "name",
  description                                                                       AS "description",
  industry                                                                          AS "industry",
  logo_url                                                                          AS "logoUrl",
  to_char(adoption_agreed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')      AS "adoptionAgreedAt",
  to_char(closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')               AS "closedAt"
`;

// store 別名（st.）付きの SELECT 句（JOIN 経由で店行を引くとき用）
const STORE_SELECT_ST = sql`
  st.id                                                                             AS "id",
  st.name                                                                           AS "name",
  st.description                                                                    AS "description",
  st.industry                                                                       AS "industry",
  st.logo_url                                                                       AS "logoUrl",
  to_char(st.adoption_agreed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "adoptionAgreedAt",
  to_char(st.closed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')            AS "closedAt"
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

    // 自分が active な管理者（store_admin）である店を取得する（店ホーム・設定の起点）。
    // owner を優先し、次に古参順（created_at 昇順）で1件返す。閉店（closed_at）店は除外する。
    async findStoreForAdmin(authUserId) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        SELECT ${STORE_SELECT_ST}
        FROM store_admin sa
        JOIN store st ON st.id = sa.store_id
        WHERE sa.auth_user_id = ${authUserId}
          AND sa.left_at IS NULL
          AND st.closed_at IS NULL
        ORDER BY (sa.role = 'owner') DESC, sa.created_at ASC
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 自分が active な管理者（owner/admin）である営業中の店を全件返す（GET /store/mine・§11.4）。
    // owner を先頭に、その後古参順（created_at 昇順）で並べる。閉店（closed_at）店は除外する。
    // 金額カラムは一切 SELECT しない（id/名前/ロゴ/自分のロールのみ・店はお金に触れない）。
    async listManagedStores(authUserId) {
      const db = getDb();
      const rows = await db.execute<StoreManagedRow>(sql`
        SELECT
          st.id        AS "id",
          st.name      AS "name",
          st.logo_url  AS "logoUrl",
          sa.role      AS "role"
        FROM store_admin sa
        JOIN store st ON st.id = sa.store_id
        WHERE sa.auth_user_id = ${authUserId}
          AND sa.left_at IS NULL
          AND st.closed_at IS NULL
        ORDER BY (sa.role = 'owner') DESC, sa.created_at ASC, st.id ASC
      `);
      return rows;
    },

    // 店舗をセルフサーブで新規作成し、同時に作成者を owner（store_admin role=owner）にする。
    // 店の作成と owner 行の作成を1トランザクションで行い、owner 不在の店を作らない。
    async createStoreWithOwner(params) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 店を作成し、導入承認の同意日時（now）を記録する
        const storeRows = await tx.execute<StoreRow>(sql`
          INSERT INTO store (name, description, industry, logo_url, adoption_agreed_at)
          VALUES (
            ${params.name},
            ${params.description},
            ${params.industry},
            ${params.logoUrl},
            now()
          )
          RETURNING ${STORE_SELECT}
        `);
        const store = storeRows[0]!;
        // 作成者を owner（active）として登録する
        await tx.execute(sql`
          INSERT INTO store_admin (store_id, auth_user_id, role)
          VALUES (${store.id}, ${params.creatorAuthUserId}, 'owner')
        `);
        // 兼任（§11.1）: 作成者を「その店の店員（staff_store）」としても在籍させる（QR・受取を持てる）。
        // 作成者の staff プロフィール（人ごと1つ）を auth_user_id で引いて所属を1件作る。
        // プロフィール未作成のケース（稀）では SELECT が 0 行になり staff_store は作られない（店作成自体は成立）。
        // ON CONFLICT は新店では発生しないが、再有効化の意味も兼ねて安全側に置く（一意制約と整合）。
        await tx.execute(sql`
          INSERT INTO staff_store (staff_id, store_id)
          SELECT s.id, ${store.id}
          FROM staff s
          WHERE s.auth_user_id = ${params.creatorAuthUserId}
          ON CONFLICT (staff_id, store_id) DO UPDATE SET left_at = NULL
        `);
        return store;
      });
    },

    // その店における auth ユーザーの active な管理者ロールを返す（無ければ null）
    async findActiveAdminRole(storeId, authUserId) {
      const db = getDb();
      const rows = await db.execute<{ role: StoreRole }>(sql`
        SELECT role AS "role"
        FROM store_admin
        WHERE store_id = ${storeId}
          AND auth_user_id = ${authUserId}
          AND left_at IS NULL
        LIMIT 1
      `);
      return rows[0]?.role ?? null;
    },

    // その店の active な管理者一覧を古参順（created_at 昇順）で返す（継承・譲渡の判定用）
    async listActiveAdmins(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreAdminRow>(sql`
        SELECT
          auth_user_id AS "authUserId",
          role         AS "role",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
        FROM store_admin
        WHERE store_id = ${storeId}
          AND left_at IS NULL
        ORDER BY created_at ASC, auth_user_id ASC
      `);
      return rows;
    },

    // その店の active な管理者一覧を表示用（staff プロフィールを左結合）で返す。
    // owner を先頭に、その後 admin を古参順（created_at 昇順）で並べる。
    // staff は auth_user_id で左結合する（管理だけの人＝staff プロフィール未作成なら表示名 null）。
    async listAdminsForDisplay(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreAdminListRow>(sql`
        SELECT
          sa.auth_user_id AS "authUserId",
          sa.role         AS "role",
          s.display_name  AS "displayName",
          s.avatar_url    AS "avatarUrl",
          to_char(sa.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
        FROM store_admin sa
        LEFT JOIN staff s ON s.auth_user_id = sa.auth_user_id
        WHERE sa.store_id = ${storeId}
          AND sa.left_at IS NULL
        ORDER BY (sa.role = 'owner') DESC, sa.created_at ASC, sa.auth_user_id ASC
      `);
      return rows;
    },

    // その店の active な管理者(admin)1人を論理削除（left_at=now）する（owner が管理者を外す）。
    // owner は対象外（role='admin' のみ）。外せた件数を返す。
    async removeAdmin(storeId, authUserId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE store_admin
        SET left_at = now()
        WHERE store_id = ${storeId}
          AND auth_user_id = ${authUserId}
          AND role = 'admin'
          AND left_at IS NULL
        RETURNING id AS "id"
      `);
      return rows.length;
    },

    // 自分が active な管理者である営業中の店が1つ以上あるか（モード切替の判定）
    async hasManagedStore(authUserId) {
      const db = getDb();
      const rows = await db.execute<{ exists: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM store_admin sa
          JOIN store st ON st.id = sa.store_id
          WHERE sa.auth_user_id = ${authUserId}
            AND sa.left_at IS NULL
            AND st.closed_at IS NULL
        ) AS "exists"
      `);
      return rows[0]?.exists ?? false;
    },

    // その店の管理者1人を論理削除（left_at=now）する。外せた件数を返す
    async leaveAdmin(storeId, authUserId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE store_admin
        SET left_at = now()
        WHERE store_id = ${storeId}
          AND auth_user_id = ${authUserId}
          AND left_at IS NULL
        RETURNING id AS "id"
      `);
      return rows.length;
    },

    // その店の active な管理者(admin)1人を owner へ昇格する（自動継承）。昇格できた件数を返す
    async promoteAdminToOwner(storeId, authUserId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE store_admin
        SET role = 'owner'
        WHERE store_id = ${storeId}
          AND auth_user_id = ${authUserId}
          AND role = 'admin'
          AND left_at IS NULL
        RETURNING id AS "id"
      `);
      return rows.length;
    },

    // owner を譲渡する（1トランザクション）。現 owner→admin、対象 admin→owner。
    // owner が1人である不変条件を保つため、demote を先に行ってから promote する（部分ユニーク制約回避）。
    async transferOwner(storeId, fromAuthUserId, toAuthUserId) {
      const db = getDb();
      await db.transaction(async (tx) => {
        // 現 owner を admin へ降格（active な owner のみ対象）
        const demoted = await tx.execute<{ id: string }>(sql`
          UPDATE store_admin
          SET role = 'admin'
          WHERE store_id = ${storeId}
            AND auth_user_id = ${fromAuthUserId}
            AND role = 'owner'
            AND left_at IS NULL
          RETURNING id AS "id"
        `);
        if (demoted.length === 0) {
          throw new Error("transfer_owner_from_not_owner");
        }
        // 対象 admin を owner へ昇格（active な admin のみ対象）
        const promoted = await tx.execute<{ id: string }>(sql`
          UPDATE store_admin
          SET role = 'owner'
          WHERE store_id = ${storeId}
            AND auth_user_id = ${toAuthUserId}
            AND role = 'admin'
            AND left_at IS NULL
          RETURNING id AS "id"
        `);
        if (promoted.length === 0) {
          throw new Error("transfer_owner_to_not_admin");
        }
      });
    },

    // 店を論理削除（閉店）する（1トランザクション）。既に閉店・存在しない店は null を返す。
    // store.closed_at をセットし、在籍中 staff_store（QR・所属）を無効化、active な store_admin も外す。
    // tip（受取記録・資金）は保全（物理削除しない）。
    async closeStore(storeId) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 営業中（closed_at IS NULL）の店だけを閉店にする（二重閉店は 0 件で null）
        const closedRows = await tx.execute<StoreRow>(sql`
          UPDATE store
          SET closed_at = now()
          WHERE id = ${storeId}
            AND closed_at IS NULL
          RETURNING ${STORE_SELECT}
        `);
        const closed = closedRows[0];
        if (!closed) return null;
        // 在籍中の所属（QR）を無効化する（新規投げ銭を停止。履歴は保持）
        await tx.execute(sql`
          UPDATE staff_store
          SET left_at = now()
          WHERE store_id = ${storeId}
            AND left_at IS NULL
        `);
        // active な管理者を外す（閉店店に active owner/admin を残さない）
        await tx.execute(sql`
          UPDATE store_admin
          SET left_at = now()
          WHERE store_id = ${storeId}
            AND left_at IS NULL
        `);
        return closed;
      });
    },

    // 店プロフィールを更新する（名前・紹介・業種・ロゴ）。導入承認の同意は変更しない
    async updateStore(storeId, params) {
      const db = getDb();
      const rows = await db.execute<StoreRow>(sql`
        UPDATE store
        SET name = ${params.name},
            description = ${params.description},
            industry = ${params.industry},
            -- ロゴは別経路（POST /store/:storeId/logo）で更新するため、テキスト編集では消さない。
            -- 値が来た時だけ差し替え、未指定（null）なら既存ロゴを保つ（COALESCE）。
            logo_url = COALESCE(${params.logoUrl}, logo_url)
        WHERE id = ${storeId}
        RETURNING ${STORE_SELECT}
      `);
      return rows[0] ?? null;
    },

    // 自店のロゴ画像URL（公開URL）を更新する（画像アップロード後・店スコープ）
    async setLogoUrl(storeId, logoUrl) {
      const db = getDb();
      await db.execute(sql`
        UPDATE store
        SET logo_url = ${logoUrl}
        WHERE id = ${storeId}
      `);
    },

    // 招待を発行する（pending で新規作成）。code は Service/Model で生成済みの一意トークン。
    // label は誰宛かの任意メモ（未入力は null で保存する）
    async createInvite(storeId, code, label) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        INSERT INTO staff_invite (store_id, code, type, status, label)
        VALUES (${storeId}, ${code}, 'staff', 'pending', ${label})
        RETURNING
          code      AS "code",
          status    AS "status",
          type      AS "type",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL      AS "acceptedStaffName",
          NULL      AS "acceptedAt",
          label     AS "label"
      `);
      return rows[0]!;
    },

    // 管理者招待を発行する（type='admin'・pending）。受け入れで store_admin role=admin を作る
    async createAdminInvite(storeId, code, label) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        INSERT INTO staff_invite (store_id, code, type, status, label)
        VALUES (${storeId}, ${code}, 'admin', 'pending', ${label})
        RETURNING
          code      AS "code",
          status    AS "status",
          type      AS "type",
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS "createdAt",
          NULL      AS "acceptedStaffName",
          NULL      AS "acceptedAt",
          label     AS "label"
      `);
      return rows[0]!;
    },

    // 自店の招待中（pending）だけを新しい順に取得する（スタッフ招待＋管理者招待の両方＝統合タブ用）。
    // accepted（在籍中タブに出る）・revoked（履歴管理しない）は二重表示を避けるため返さない。
    // type（staff/admin）を併せて返し、招待中タブで種類ラベルを出し分ける（§11.2）。
    async listInvites(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.status      AS "status",
          i.type        AS "type",
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

    // 自店の招待 1 件（pending）を取得する（再コピー画面・取り消しの対象確認）。pending 以外は対象外。
    // スタッフ招待・管理者招待どちらも対象（type で絞らない）。
    async findInviteByCode(storeId, code) {
      const db = getDb();
      const rows = await db.execute<StoreInviteRow>(sql`
        SELECT
          i.code        AS "code",
          i.status      AS "status",
          i.type        AS "type",
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
    // 在籍中（left_at IS NULL）のみ返す（脱退・在籍解除済みは外れる）。
    // 並びは在籍（staff_store.created_at）が古い順にして、件数・金額では並べ替えない（中立）。
    async listStaff(storeId) {
      const db = getDb();
      const rows = await db.execute<StoreStaffRow>(sql`
        SELECT
          s.id            AS "id",
          s.display_name  AS "displayName",
          s.headline      AS "headline",
          s.avatar_url    AS "avatarUrl",
          s.auth_user_id  AS "authUserId"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        WHERE ss.store_id = ${storeId}
          AND ss.left_at IS NULL
        ORDER BY ss.created_at ASC
      `);
      return rows;
    },

    // 自店の在籍中スタッフ1人の詳細を取得する（店スコープ・金額なし）。
    // 在籍中（left_at IS NULL）のみ対象。他店・脱退済み・存在しないなら null。
    // 兼任（§11.1/§11.3）: staff.auth_user_id で store_admin（active）を左結合し、その人のこの店での
    // 管理者ロール（owner/admin）を role として返す（管理者でなければ null）。authUserId は管理者操作の対象特定に使う。
    async findStaffDetail(storeId, staffId) {
      const db = getDb();
      const rows = await db.execute<StoreStaffDetailRow>(sql`
        SELECT
          s.id            AS "id",
          s.display_name  AS "displayName",
          s.headline      AS "headline",
          s.avatar_url    AS "avatarUrl",
          to_char(ss.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "joinedAt",
          ss.id           AS "membershipId",
          s.auth_user_id  AS "authUserId",
          sa.role         AS "role"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        LEFT JOIN store_admin sa
          ON sa.store_id = ss.store_id
          AND sa.auth_user_id = s.auth_user_id
          AND sa.left_at IS NULL
        WHERE ss.store_id = ${storeId}
          AND ss.staff_id = ${staffId}
          AND ss.left_at IS NULL
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 自店のスタッフを在籍解除する（論理削除）。その (staff,store) の在籍中 membership に left_at=now()。
    // 物理削除しない（tip の履歴を保持）。在籍中（left_at IS NULL）のみ対象。解除できた件数を返す。
    async removeStaff(storeId, staffId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        UPDATE staff_store
        SET left_at = now()
        WHERE store_id = ${storeId}
          AND staff_id = ${staffId}
          AND left_at IS NULL
        RETURNING id AS "id"
      `);
      return rows.length;
    },

    // 自店宛の「お客さまの声」を新しい順に取得する（成立済みのみ・金額は SELECT しない）。
    // period（from/to）を渡すとその期間に絞る（COALESCE(succeeded_at, created_at) を受取日時として AND）。
    // staffId を渡すと、その店員さん宛の声だけに絞る（AND t.staff_id = ...・期間と併用）。
    async listGratitudeVoices(storeId, limit, period, staffId) {
      const db = getDb();
      // 特定スタッフ指定時のみ staff_id の絞り込み条件を足す（未指定は全スタッフ）
      const staffClause = staffId ? sql`AND t.staff_id = ${staffId}` : sql``;
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
          ${gratitudePeriodClause(period)}
          ${staffClause}
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
    // 在籍中（ss.left_at IS NULL）のスタッフのみ対象（脱退者はスタッフ別一覧・選択肢から外れる）。
    //  ※ totalCount/voices（店全体）は脱退者の在籍当時分も含むが、ここ（perStaff）は active のみ。
    //    その結果 sum(perStaff) < totalCount になり得るが、仕様どおり（在籍管理は active・総数は履歴保持）。
    // period（from/to）を渡すと、件数を数える tip をその期間に絞る（LEFT JOIN の ON 条件に AND）。
    // ON 側に置くことで、期間内に件数 0 のスタッフも名簿順で 0 件として残る（中立な並びを保つ）。
    async listGratitudePerStaff(storeId, period) {
      const db = getDb();
      const rows = await db.execute<GratitudePerStaffRow>(sql`
        SELECT
          s.id            AS "staffId",
          s.display_name  AS "staffName",
          s.avatar_url    AS "avatarUrl",
          COUNT(t.id)::int AS "count"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        LEFT JOIN tip t
          ON t.staff_id = s.id
          AND t.store_id = ${storeId}
          AND t.status = 'succeeded'
          ${gratitudePeriodClause(period)}
        WHERE ss.store_id = ${storeId}
          AND ss.left_at IS NULL
        GROUP BY s.id, s.display_name, s.avatar_url, ss.created_at
        ORDER BY ss.created_at ASC
      `);
      return rows;
    },
  };
}
