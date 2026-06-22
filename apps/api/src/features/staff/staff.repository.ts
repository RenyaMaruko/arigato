import { getDb, sql } from "@arigato/db";
import type { IdentityStatus, InviteStatus, StoreStatus } from "./staff.model.js";

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
  };
}
