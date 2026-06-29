import { getDb, sql } from "@arigato/db";
import type {
  IdentityStatus,
  InviteStatus,
  SettlementStatus,
  PayoutStatus,
} from "./staff.model.js";

/**
 * staff feature の Repository 層（DB アクセス専用・生 SQL）。
 * 生 SQL はこの層にだけ書く。Service / Model からは呼び出さない。
 *
 * 多対多モデル: staff（人）は store_id を持たず、所属は staff_store（membership）で表す。
 * QR は membership 単位。プロフィールは人ごとに1つ。
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
  // 発行元の店が導入承認に同意済みか（adoption_agreed_at が設定されているか）
  storeAdopted: boolean;
};

// プロフィール本体（人ごと1つ。所属は別途 membership で持つ）
export type StaffProfileRow = {
  id: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
  identityStatus: IdentityStatus;
};

// 所属（membership＝人×店）1件分（GET /staff/me の所属一覧・店ごとQR用）
export type StaffMembershipRow = {
  membershipId: string;
  storeId: string;
  storeName: string;
};

// プロフィール作成時に Repository が受け取る値（所属は含めない。人ごと1つ）
export type InsertStaffParams = {
  authUserId: string;
  displayName: string;
  headline: string | null;
  avatarUrl: string | null;
};

// 招待消費（所属追加）の結果区分
// joined: 新たに所属が追加された / already_member: 既に同店所属（多重参加不可）
export type JoinOutcome = "joined" | "already_member";

// 招待で所属を追加した結果（membership と店情報を返す）
export type JoinResultRow = {
  outcome: JoinOutcome;
  membershipId: string;
  storeId: string;
  storeName: string;
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

// 受取履歴の絞り込み（任意・list と合計の両方に同じ条件で適用する）。
// list 取得・合計集計でまったく同じ WHERE を作るため1つの型に束ねる（サマリー連動を担保）。
export type StaffTipsFilter = {
  // 店舗で絞る（t.store_id = storeId）。未指定はフィルタ無し
  storeId?: string;
  // 受取日時の下限（COALESCE(succeeded_at,created_at) >= from）。ISO 文字列。未指定はフィルタ無し
  from?: string;
  // 受取日時の上限（COALESCE(succeeded_at,created_at) < to・排他）。ISO 文字列。未指定はフィルタ無し
  to?: string;
};

// 受取履歴のキーセットページング取得に渡すパラメータ（本人のみ）。
// cursor が無ければ先頭ページ。limit+1 件取って「次があるか」を判定するのは Service。
export type ListTipsPageParams = {
  authUserId: string;
  // 次ページの基点（最後に取得した行の受取日時・id）。先頭ページは null
  cursor: { receivedAt: string; id: string } | null;
  // 取得件数（Service が limit+1 を渡し、次ページの有無を判定する）
  take: number;
  // 絞り込み（店舗・期間。未指定はフィルタ無し）。合計集計と同じ条件を渡す
  filter?: StaffTipsFilter;
};

// 受取履歴の全件集計（合計金額・件数）。ページに依らず一定（必ず全件の別集計）。
export type StaffTipsTotals = {
  // 全受取の件数（成立済み・返金/異議を除く）
  totalCount: number;
  // 全受取の手取り合計（FLOOR(amount*0.85) の総和・円）。本人のみ
  totalAmount: number;
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

// 着金可能（payable）な tip 1件の最小情報（送金額算出・paid 化の対象特定に使う）。amount は額面。
export type PayableTipRow = {
  tipId: string;
  // 額面（お客さま支払額・円）。送金額は手取り（約85%）合計を Model で算出する
  amount: number;
};

// 送金（payout）の本人・Connect 連携状態（送金可否判定・Stripe payout 実行に使う）
export type PayoutContextRow = {
  // staff（人）の ID
  staffId: string;
  // 本人の Connected Account（未連携は null）。Stripe payout の実行先
  stripeAccountId: string | null;
  identityStatus: IdentityStatus;
};

// 送金履歴1件分（本人のみ・金額を含む）
export type PayoutRow = {
  id: string;
  amount: number;
  status: PayoutStatus;
  // 申請日時（ISO 文字列）
  createdAt: string;
  // 着金日時（着金済のみ・ISO 文字列。未着金は null）
  arrivedAt: string | null;
  failureReason: string | null;
};

// 送金記録＋対象 tip の paid 化をまとめて作った結果
export type CreatePayoutRow = {
  id: string;
  amount: number;
  status: PayoutStatus;
};

/**
 * Service が依存する Repository の契約（注入点）。
 * 実装は下の createStaffRepository（実 DB）。テストではこの型を満たすモックを渡す。
 */
export type StaffRepository = {
  // 招待コードから招待＋発行元の店情報を取得（招待検証・所属確定の起点）
  findInviteByCode: (code: string) => Promise<InviteRow | null>;
  // auth ユーザーIDから自分の staff プロフィール（人ごと1つ）を取得（GET /staff/me / 重複作成防止）
  findStaffByAuthUserId: (authUserId: string) => Promise<StaffProfileRow | null>;
  // 本人の所属（membership）一覧を在籍が古い順で取得する（店ごとQR用・GET /staff/me）
  listMembershipsByAuthUserId: (authUserId: string) => Promise<StaffMembershipRow[]>;
  // プロフィール（人ごと1つ）を作成する。所属は含めない。作成したプロフィール行を返す。
  createStaffProfile: (params: InsertStaffParams) => Promise<StaffProfileRow>;
  // 招待コードで所属（staff_store）を追加する（参加の確定点）。
  // 招待を accepted 化し、当該店への membership を1件作る（既に同店所属なら already_member）。
  // 招待二重消費の防止と membership 一意制約を1トランザクションで担保する。
  joinStoreByInvite: (authUserId: string, code: string) => Promise<JoinResultRow>;
  // 自分のプロフィール（display_name・headline・avatar）を更新する。更新後の行を返す
  updateStaffProfile: (
    authUserId: string,
    params: { displayName: string; headline: string | null; avatarUrl: string | null },
  ) => Promise<StaffProfileRow | null>;
  // 本人のアバター画像URL（公開URL）を更新する（画像アップロード後・本人スコープ）。
  setAvatarUrl: (authUserId: string, avatarUrl: string) => Promise<void>;
  // 本人の Connect 連携状態（Connected Account・identity_status）を取得（オンボーディングの起点）
  findStaffConnect: (authUserId: string) => Promise<StaffConnectRow | null>;
  // 新規作成した Connected Account を本人の staff に保存する（オンボーディング開始時に1度だけ）
  setStripeAccountId: (authUserId: string, stripeAccountId: string) => Promise<void>;
  // 本人の受取履歴（成立済み）を新しい順に「1ページ分」取得する（キーセットページング・本人のみ）。
  // cursor 以降を COALESCE(succeeded_at,created_at) DESC, id DESC で take 件返す（金額・メッセージ含む）。
  listTipsPageByAuthUserId: (params: ListTipsPageParams) => Promise<StaffTipRow[]>;
  // 本人の受取履歴の「全件集計」（合計金額・件数）を取得する（ページに依らず一定・本人のみ）。
  // ページの items から計算せず、必ず list と同じ WHERE 条件（＋同じフィルタ）で全件を SUM/COUNT する。
  // filter を渡すと合計もフィルタ後の値になる（サマリー連動）。
  getStaffTipsTotalsByAuthUserId: (
    authUserId: string,
    filter?: StaffTipsFilter,
  ) => Promise<StaffTipsTotals>;
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
  // 送金（payout）の本人・Connect 連携状態を取得（送金可否判定・Stripe payout の実行先）。未作成は null
  findPayoutContext: (authUserId: string) => Promise<PayoutContextRow | null>;
  // 本人の着金可能（payable）な成立済み tip の id・額面を取得する（送金額の算出・paid 化の対象特定）
  listPayableTipsByAuthUserId: (authUserId: string) => Promise<PayableTipRow[]>;
  // 【DB 先行記録】送金記録を pending（stripe_payout_id は NULL）で1件作り、
  // 対象の payable な tip を paid＋payout_id 紐付けに更新する。1トランザクションで原子的に行う。
  // ここで失敗したら呼び出し側は Stripe を呼ばない（お金は動かない＝安全）。
  // 対象 tip は引数の tipIds（事前に算出した payable 集合）かつ今なお payable のものに限定する。
  createPendingPayoutAndMarkTipsPaid: (params: {
    staffId: string;
    amount: number;
    tipIds: string[];
  }) => Promise<CreatePayoutRow>;
  // 【Stripe 成功後】payout 行に stripe_payout_id を更新する（status は pending のまま）。
  // 着金確定は payout.paid Webhook を正とするため、ここでは status を変えない。
  attachStripePayoutId: (payoutId: string, stripePayoutId: string) => Promise<void>;
  // 【Stripe 失敗時の revert】payout 行を status=failed＋failure_reason にし、
  // この payout で paid になった tip を payable へ戻す（payout_id=NULL・settlement_status=payable）。
  // 自前 payout 行の id で照合する。1トランザクションで原子的に行う。
  revertPayoutByPayoutId: (payoutId: string, failureReason: string | null) => Promise<void>;
  // 本人の送金履歴を新しい順に取得する（金額・状態・申請日時・着金日時。本人のみ）
  listPayoutsByAuthUserId: (authUserId: string) => Promise<PayoutRow[]>;
  // payout.paid を反映する。stripe_payout_id を主・自前 payout 行の id（metadata 由来）を従に照合し、
  // status=paid・arrived_at を記録する（照合できた行の stripe_payout_id も併せて補完する）。
  // 既に paid なら二重遷移しない（冪等）。反映できたか（boolean）を返す。
  markPayoutPaid: (
    params: { stripePayoutId: string | null; payoutId: string | null },
    arrivedAt: Date,
  ) => Promise<boolean>;
  // payout.failed を反映する。stripe_payout_id を主・自前 payout 行の id（metadata 由来）を従に照合し、
  // status=failed・failure_reason を記録し、この payout で paid になった tip を payable へ戻す
  // （tip.payout_id=null・settlement_status=payable）。1トランザクションで原子的に行う。反映できたか（boolean）。
  markPayoutFailedAndRevertTips: (
    params: { stripePayoutId: string | null; payoutId: string | null },
    failureReason: string | null,
  ) => Promise<boolean>;
  // (d) 送金（payout）を stripe_payout_id（主）/ 自前 payout 行 id（従）で照合し、台帳追記に必要な
  //   自前 payout 行 id・Stripe Payout ID・Connected Account ID を取得する。該当なしは null。
  findPayoutForLedger: (params: {
    stripePayoutId: string | null;
    payoutId: string | null;
  }) => Promise<{
    payoutId: string;
    stripePayoutId: string | null;
    connectedAccountId: string | null;
  } | null>;
  // (d) ある payout 行に紐づく（paid 化した）tip を、台帳追記の素材として取得する。
  //   手動送金は Stripe の balance_transactions?payout= で内訳を引けない（自動送金のみ対応）ため、
  //   「この payout で paid にした tip」という DB の確定リンクを唯一の突き合わせ源泉とする（spec の意図）。
  //   各 tip の balance_transaction_id / charge_id（(c) で鏡保存済み）と手取り額を返す。
  listPaidTipsForPayout: (payoutId: string) => Promise<
    Array<{
      tipId: string;
      balanceTransactionId: string | null;
      stripeChargeId: string | null;
      // 額面（円）。台帳には手取り（約85%）に換算して記録する
      amount: number;
    }>
  >;
  // (d) ある charge ID（ch_…）から自前 tip の id を逆引きする（台帳の payout⇄bt⇄tip 対応付け用）。該当なしは null。
  findTipIdByChargeId: (chargeId: string) => Promise<string | null>;
  // (d) 照合台帳（payout_ledger）へ追記する（append-only・上書き禁止）。
  //   同一 (payout_id, balance_transaction_id) は二重追記しない（冪等）。追記した件数を返す。
  appendPayoutLedgerEntries: (
    payoutId: string,
    entries: Array<{
      balanceTransactionId: string | null;
      stripeChargeId: string | null;
      tipId: string | null;
      amount: number;
      type: string;
    }>,
  ) => Promise<number>;
  // (f) 補正エントリ1件を照合台帳へ追記する（append-only。返金・異議・送金失敗などの補正）。
  //   既存行は書き換えず、補正は新しい行として記録する。追記した行の id を返す。
  appendLedgerCorrection: (params: {
    // 対応する自前 payout 行（送金前の返金など payout が無い補正は null）
    payoutId: string | null;
    tipId: string | null;
    stripeChargeId: string | null;
    amount: number;
    type: string;
  }) => Promise<string>;
  // (e) 日次照合バッチ用: Connected Account を持つ店員ごとに、DB 側の「合計」だけを集約して返す。
  //   全件スキャンを避けるため、まず合計レベル（paid 合計・held+payable 合計・進行中 payout 件数・未確定 tip 件数）で
  //   Stripe と突き合わせ、ズレた店員だけを後で掘り下げる。金額は店員手取り（約85%）換算済みの円。
  listReconcileTotalsByStaff: () => Promise<ReconcileStaffTotals[]>;
};

// (e) 日次照合の合計（店員1人分）。Stripe と突き合わせる DB 側の集約。
export type ReconcileStaffTotals = {
  staffId: string;
  // 送金元 Connected Account（Stripe 残高・payout を読む口座）
  connectedAccountId: string;
  // DB 上の paid な tip の手取り合計（円）。Stripe の成立 payout 合計と突き合わせる
  paidTakeTotal: number;
  // DB 上の held+payable な tip の手取り合計（円）。Stripe の balance(available+pending) と突き合わせる
  unsettledTakeTotal: number;
  // 進行中（pending）の自前 payout 件数（突き合わせの掘り下げ対象の目安）
  pendingPayoutCount: number;
  // 決済未確定（pending）の tip 件数（取りこぼしの掘り下げ対象の目安）
  pendingTipCount: number;
};

/**
 * 受取履歴の絞り込み（店舗・期間）を SQL の AND 断片に変換する内部ヘルパ。
 * list 取得と合計集計でまったく同じ条件を使い、サマリーが一覧と連動するようにする
 * （合計もフィルタ後の全件集計になる）。値はパラメータとして束縛するため安全。
 *  - storeId: t.store_id = ${storeId}
 *  - from:    COALESCE(succeeded_at,created_at) >= ${from}::timestamptz（含む）
 *  - to:      COALESCE(succeeded_at,created_at) <  ${to}::timestamptz（排他）
 * 並びの基準（COALESCE(succeeded_at,created_at)）は orderExpr と同一にして整合させる。
 * 未指定（undefined）の条件は付けない（フィルタ無し）。
 */
function buildTipsFilterCondition(filter: StaffTipsFilter | undefined) {
  if (!filter) return sql``;
  // 受取日時の式（ソート・cursor 比較と同一にする）
  const receivedExpr = sql`COALESCE(t.succeeded_at, t.created_at)`;
  const parts = [];
  // 店舗フィルタ
  if (filter.storeId) {
    parts.push(sql`AND t.store_id = ${filter.storeId}`);
  }
  // 期間の下限（含む）
  if (filter.from) {
    parts.push(sql`AND ${receivedExpr} >= ${filter.from}::timestamptz`);
  }
  // 期間の上限（排他）
  if (filter.to) {
    parts.push(sql`AND ${receivedExpr} < ${filter.to}::timestamptz`);
  }
  // 断片を1つにまとめる（無ければ空）
  return parts.length > 0 ? sql.join(parts, sql` `) : sql``;
}

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
          (st.adoption_agreed_at IS NOT NULL) AS "storeAdopted"
        FROM staff_invite i
        JOIN store st ON st.id = i.store_id
        WHERE i.code = ${code}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // auth ユーザーIDで自分の staff プロフィール（人ごと1つ）を取得（所属は含めない）
    async findStaffByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<StaffProfileRow>(sql`
        SELECT
          s.id              AS "id",
          s.display_name    AS "displayName",
          s.headline        AS "headline",
          s.avatar_url      AS "avatarUrl",
          s.identity_status AS "identityStatus"
        FROM staff s
        WHERE s.auth_user_id = ${authUserId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 本人の所属（membership）一覧を在籍が古い順で取得する（店ごとQR用・中立な並び）
    async listMembershipsByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<StaffMembershipRow>(sql`
        SELECT
          ss.id      AS "membershipId",
          ss.store_id AS "storeId",
          st.name    AS "storeName"
        FROM staff_store ss
        JOIN staff s ON s.id = ss.staff_id
        JOIN store st ON st.id = ss.store_id
        WHERE s.auth_user_id = ${authUserId}
        ORDER BY ss.created_at ASC
      `);
      return rows;
    },

    // プロフィール（人ごと1つ）を作成する。所属は別途 join で追加する。
    async createStaffProfile(params) {
      const db = getDb();
      const rows = await db.execute<StaffProfileRow>(sql`
        INSERT INTO staff (auth_user_id, display_name, headline, avatar_url)
        VALUES (${params.authUserId}, ${params.displayName}, ${params.headline}, ${params.avatarUrl})
        RETURNING
          id              AS "id",
          display_name    AS "displayName",
          headline        AS "headline",
          avatar_url      AS "avatarUrl",
          identity_status AS "identityStatus"
      `);
      return rows[0]!;
    },

    // 招待コードで所属（staff_store）を追加する（参加の確定点）。
    // 1トランザクションで:
    //  1. auth ユーザーの staff（人）を引く（無ければ呼び出し側で先にプロフィール作成済みのはず）
    //  2. 招待が pending かつ店が導入承認済みであることを確認
    //  3. 既に同店所属なら already_member（招待は消費しない・多重参加不可）
    //  4. 新規なら membership を1件作り、招待を accepted 化する
    async joinStoreByInvite(authUserId, code) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 招待を取得（pending かつ店承認済みのときだけ使える）
        const inviteRows = await tx.execute<{
          storeId: string;
          storeName: string;
          status: InviteStatus;
          storeAdopted: boolean;
        }>(sql`
          SELECT
            i.store_id AS "storeId",
            st.name    AS "storeName",
            i.status   AS "status",
            (st.adoption_agreed_at IS NOT NULL) AS "storeAdopted"
          FROM staff_invite i
          JOIN store st ON st.id = i.store_id
          WHERE i.code = ${code}
          LIMIT 1
          FOR UPDATE OF i
        `);
        const invite = inviteRows[0];
        if (!invite || invite.status !== "pending" || !invite.storeAdopted) {
          throw new Error("invite_not_usable");
        }

        // 本人の staff（人）を引く
        const staffRows = await tx.execute<{ id: string }>(sql`
          SELECT id AS "id" FROM staff WHERE auth_user_id = ${authUserId} LIMIT 1
        `);
        const staffRow = staffRows[0];
        if (!staffRow) {
          // プロフィール未作成（先に POST /staff/me が必要）
          throw new Error("staff_not_found");
        }

        // 既に同じ店に所属していないか（多重参加不可）
        const existing = await tx.execute<{ id: string }>(sql`
          SELECT id AS "id"
          FROM staff_store
          WHERE staff_id = ${staffRow.id} AND store_id = ${invite.storeId}
          LIMIT 1
        `);
        if (existing[0]) {
          // 既に所属している → 招待は消費せず already_member を返す
          return {
            outcome: "already_member" as const,
            membershipId: existing[0].id,
            storeId: invite.storeId,
            storeName: invite.storeName,
          };
        }

        // 新規所属（membership）を作成する
        const inserted = await tx.execute<{ id: string }>(sql`
          INSERT INTO staff_store (staff_id, store_id)
          VALUES (${staffRow.id}, ${invite.storeId})
          RETURNING id AS "id"
        `);
        const membershipId = inserted[0]!.id;

        // 招待を消費する（pending のときのみ。二重消費はここで弾く）
        const accepted = await tx.execute<{ id: string }>(sql`
          UPDATE staff_invite
          SET status = 'accepted',
              accepted_staff_id = ${staffRow.id},
              accepted_at = now()
          WHERE code = ${code}
            AND status = 'pending'
          RETURNING id AS "id"
        `);
        if (accepted.length === 0) {
          // 検証後に他リクエストが先に消費していた → 巻き戻す
          throw new Error("invite_not_usable");
        }

        return {
          outcome: "joined" as const,
          membershipId,
          storeId: invite.storeId,
          storeName: invite.storeName,
        };
      });
    },

    // 自分のプロフィールを更新（所属は変更しない）。本人の auth_user_id で限定する
    async updateStaffProfile(authUserId, params) {
      const db = getDb();
      const rows = await db.execute<StaffProfileRow>(sql`
        UPDATE staff
        SET display_name = ${params.displayName},
            headline = ${params.headline},
            -- アバターは別経路（POST /staff/me/avatar）で更新するため、テキスト編集では消さない。
            -- 値が来た時だけ差し替え、未指定（null）なら既存アバターを保つ（COALESCE）。
            avatar_url = COALESCE(${params.avatarUrl}, avatar_url)
        WHERE auth_user_id = ${authUserId}
        RETURNING
          id              AS "id",
          display_name    AS "displayName",
          headline        AS "headline",
          avatar_url      AS "avatarUrl",
          identity_status AS "identityStatus"
      `);
      return rows[0] ?? null;
    },

    // 本人のアバター画像URL（公開URL）を更新する（画像アップロード後・本人スコープで限定）
    async setAvatarUrl(authUserId, avatarUrl) {
      const db = getDb();
      await db.execute(sql`
        UPDATE staff
        SET avatar_url = ${avatarUrl}
        WHERE auth_user_id = ${authUserId}
      `);
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

    // 本人の受取履歴（成立済み）を新しい順に「1ページ分」取得する（キーセットページング・本人のみ）。
    // 自分の auth_user_id をキーに staff を結合し、他人の行は決して返さない。
    // 店ラベルは tip に固定保存した store_id から引く（退店後も文脈が残る）。
    //
    // 並びは COALESCE(succeeded_at,created_at) DESC, id DESC を維持する（同一日時の同点も安定）。
    // cursor がある場合は (受取日時, id) < (cursorTs, cursorId) の行だけを返す（DESC 並びの「続き」）。
    // 比較は row-value 比較で行い、第1キー（受取日時）の同点は第2キー（id）で割る。
    async listTipsPageByAuthUserId(params) {
      const db = getDb();
      // cursor の受取日時は ISO 文字列。SQL では timestamptz として比較するためキャストする。
      // 受取日時の式（COALESCE(succeeded_at, created_at)）はソートと比較で同一にする。
      const orderExpr = sql`COALESCE(t.succeeded_at, t.created_at)`;
      // cursor 条件（先頭ページは無条件）。row-value 比較で (日時, id) < (基点日時, 基点id) を表す。
      const cursorCondition = params.cursor
        ? sql`AND (${orderExpr}, t.id) < (${params.cursor.receivedAt}::timestamptz, ${params.cursor.id}::uuid)`
        : sql``;
      // 絞り込み（店舗・期間）。合計集計とまったく同じ条件を AND で足す（サマリー連動）。
      const filterCondition = buildTipsFilterCondition(params.filter);
      const rows = await db.execute<StaffTipRow>(sql`
        SELECT
          t.id                AS "id",
          t.amount            AS "amount",
          t.message           AS "message",
          to_char(${orderExpr} AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "receivedAt",
          st.name             AS "storeName",
          t.settlement_status AS "settlementStatus"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        JOIN store st ON st.id = t.store_id
        WHERE s.auth_user_id = ${params.authUserId}
          AND t.status = 'succeeded'
          -- (f) 返金・チャージバックの tip は受取履歴から除外する
          AND t.settlement_status NOT IN ('refunded', 'disputed')
          ${filterCondition}
          ${cursorCondition}
        ORDER BY ${orderExpr} DESC, t.id DESC
        LIMIT ${params.take}
      `);
      return rows;
    },

    // 本人の受取履歴の「全件集計」（合計金額・件数）を取得する（ページに依らず一定・本人のみ）。
    // ページの items から計算せず、受取履歴と同じ WHERE 条件で全件を SUM/COUNT する。
    // 手取り合計は FLOOR(amount * 0.85)（＝JS の calculateStaffTakeAmount=Math.floor(amount*0.85)）と一致させる。
    async getStaffTipsTotalsByAuthUserId(authUserId, filter) {
      const db = getDb();
      // list 取得とまったく同じフィルタ条件を AND で足す（合計もフィルタ後の値＝サマリー連動）。
      const filterCondition = buildTipsFilterCondition(filter);
      const rows = await db.execute<StaffTipsTotals>(sql`
        SELECT
          COUNT(*)::int                                  AS "totalCount",
          COALESCE(SUM(FLOOR(t.amount * 0.85)), 0)::int  AS "totalAmount"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        WHERE s.auth_user_id = ${authUserId}
          AND t.status = 'succeeded'
          -- (f) 返金・チャージバックの tip は合計集計から除外する（受取履歴と同じ条件）
          AND t.settlement_status NOT IN ('refunded', 'disputed')
          ${filterCondition}
      `);
      // COUNT/SUM は必ず1行返る（0件でも 0）。念のためフォールバックを置く
      return rows[0] ?? { totalCount: 0, totalAmount: 0 };
    },

    // 本人の保留残高集計に使う、成立済み tip の settlement 状態と金額を取得する（本人のみ・人ごと集約）
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
          -- (f) 返金・チャージバックの tip は残高集計から除外する（Stripe を正・負を握りつぶさない）
          AND t.settlement_status NOT IN ('refunded', 'disputed')
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
          -- (f) 返金・チャージバックの tip は申告データから除外する（収入ではない）
          AND t.settlement_status NOT IN ('refunded', 'disputed')
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

        // この店員さんの held の tip を payable（着金可能）へ遷移する（人ごと・全所属店分まとめて）
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

    // 送金の本人・Connect 連携状態を取得する（送金可否判定・Stripe payout の実行先）
    async findPayoutContext(authUserId) {
      const db = getDb();
      const rows = await db.execute<PayoutContextRow>(sql`
        SELECT
          id                AS "staffId",
          stripe_account_id AS "stripeAccountId",
          identity_status   AS "identityStatus"
        FROM staff
        WHERE auth_user_id = ${authUserId}
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // 本人の着金可能（payable）な成立済み tip の id・額面を取得する（本人スコープ）。
    // 送金額（手取り合計）の算出と、paid 化する対象の特定にだけ使う。
    // 古い受取から順に送る（FIFO）ため受取日時の昇順で返す。available を上限に
    // 古い分から選定する（selectPayoutTipsWithinAvailable）ので並び順が意味を持つ。
    async listPayableTipsByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<PayableTipRow>(sql`
        SELECT
          t.id     AS "tipId",
          t.amount AS "amount"
        FROM tip t
        JOIN staff s ON s.id = t.staff_id
        WHERE s.auth_user_id = ${authUserId}
          AND t.status = 'succeeded'
          AND t.settlement_status = 'payable'
          -- (c) 送金候補は「Stripe で実際に送金可能(available)になった分」だけに絞る。
          -- bt_status=available（0077等で即確定）か、available_on を過ぎた（4242等が確定）tip のみ。
          -- これをしないと pending（確定待ち）の tip まで送金対象に選ばれ、送れるはずの settled tip が
          -- 残ったり、pending を paid にして DB と Stripe の割り当てがズレる（宙ぶらりんの余りが出る）。
          -- 最終的な送金額は呼び出し側で Stripe 実 available を上限にキャップする（#5）。
          AND (
            t.bt_status = 'available'
            OR (t.available_on IS NOT NULL AND t.available_on <= now())
          )
        ORDER BY COALESCE(t.succeeded_at, t.created_at) ASC
      `);
      return rows;
    },

    // 【DB 先行記録】送金記録を pending（stripe_payout_id は NULL）で作り、
    // 対象の payable な tip を paid＋payout_id 紐付けへ更新する。1トランザクションで原子的に行う。
    // tip は引数の tipIds かつ今なお payable のものに限定し、別リクエストとの競合
    // （同じ payable を二重送金）を WHERE 条件で弾く。
    // ここで失敗したら呼び出し側は Stripe を呼ばない（お金は動かない＝安全）。
    async createPendingPayoutAndMarkTipsPaid(params) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 送金記録（pending・stripe_payout_id は NULL）を作成する
        const inserted = await tx.execute<CreatePayoutRow>(sql`
          INSERT INTO payout (staff_id, amount, status, stripe_payout_id)
          VALUES (${params.staffId}, ${params.amount}, 'pending', NULL)
          RETURNING
            id     AS "id",
            amount AS "amount",
            status AS "status"
        `);
        const payoutRow = inserted[0]!;

        // 対象の payable な tip を paid＋この payout に紐付け（今なお payable のものだけを更新）。
        //
        // ★実 DB の落とし穴: drizzle(postgres-js) は sql`${jsArray}` を「行（record）」= ($1,$2,…) に
        //   展開するため、`= ANY(${tipIds})` は「op ANY requires array on right side」、
        //   `= ANY(${tipIds}::uuid[])` は「cannot cast type record to uuid[]」で実 DB だと失敗する
        //   （メモリ実装では配列をそのまま扱えるため、この不具合がテストをすり抜けていた）。
        //   そこで「PostgreSQL の配列リテラル文字列」を1パラメータで渡し ::uuid[] へキャストする。
        //   値は ${tipIdsLiteral} として束縛されるため安全（SQL インジェクションにならない）。
        //   空配列のときも '{}'::uuid[] となり「何も更新しない」正しい挙動になる。
        const tipIdsLiteral = `{${params.tipIds.join(",")}}`;
        await tx.execute(sql`
          UPDATE tip
          SET settlement_status = 'paid',
              payout_id = ${payoutRow.id}
          WHERE id = ANY(${tipIdsLiteral}::uuid[])
            AND settlement_status = 'payable'
        `);

        return payoutRow;
      });
    },

    // 【Stripe 成功後】payout 行に stripe_payout_id を更新する（status は pending のまま）。
    // 着金確定は payout.paid Webhook を正とするため、ここでは status を変えない。
    async attachStripePayoutId(payoutId, stripePayoutId) {
      const db = getDb();
      await db.execute(sql`
        UPDATE payout
        SET stripe_payout_id = ${stripePayoutId}
        WHERE id = ${payoutId}::uuid
      `);
    },

    // 【Stripe 失敗時の revert】payout 行を status=failed＋failure_reason にし、
    // この payout で paid になった tip を payable へ戻す（payout_id=NULL）。自前 payout 行の id で照合する。
    // 1トランザクションで原子的に行う（「Stripe 失敗なのに tip が paid のまま」を防ぐ）。
    async revertPayoutByPayoutId(payoutId, failureReason) {
      const db = getDb();
      await db.transaction(async (tx) => {
        // payout 行を failed に確定する
        await tx.execute(sql`
          UPDATE payout
          SET status = 'failed',
              failure_reason = ${failureReason}
          WHERE id = ${payoutId}::uuid
        `);

        // この payout で paid になった tip を payable へ戻す（紐付けも解除）
        await tx.execute(sql`
          UPDATE tip
          SET settlement_status = 'payable',
              payout_id = NULL
          WHERE payout_id = ${payoutId}::uuid
            AND settlement_status = 'paid'
        `);
      });
    },

    // 本人の送金履歴を新しい順に取得する（金額・状態・申請日時・着金日時。本人のみ）
    async listPayoutsByAuthUserId(authUserId) {
      const db = getDb();
      const rows = await db.execute<PayoutRow>(sql`
        SELECT
          p.id     AS "id",
          p.amount AS "amount",
          p.status AS "status",
          to_char(p.created_at AT TIME ZONE 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt",
          CASE WHEN p.arrived_at IS NULL THEN NULL
               ELSE to_char(p.arrived_at AT TIME ZONE 'UTC',
                            'YYYY-MM-DD"T"HH24:MI:SS"Z"') END AS "arrivedAt",
          p.failure_reason AS "failureReason"
        FROM payout p
        JOIN staff s ON s.id = p.staff_id
        WHERE s.auth_user_id = ${authUserId}
        ORDER BY p.created_at DESC
      `);
      return rows;
    },

    // payout.paid を反映する。stripe_payout_id を主・自前 payout 行の id（metadata 由来）を従に照合し、
    // まだ paid でなければ status=paid・arrived_at を記録する（照合できた行の stripe_payout_id も補完する）。
    // 既に paid なら 0 件更新（冪等・二重遷移しない）。反映できたかを返す。
    // 着金日時は ISO 文字列に変換して timestamptz へ渡す（postgres-js は Date を直接束縛できないため）。
    async markPayoutPaid(params, arrivedAt) {
      const db = getDb();
      const arrivedAtIso = arrivedAt.toISOString();
      // stripe_payout_id（無ければ照合不成立の番兵）/ 自前 payout 行 id（無ければ NULL）。
      // 万一 stripe_payout_id 更新前に落ちても metadata.payout_id（= payout 行 id）で確定できる。
      const updated = await db.execute<{ id: string }>(sql`
        UPDATE payout
        SET status = 'paid',
            arrived_at = ${arrivedAtIso}::timestamptz,
            -- stripe_payout_id が未補完なら今回の Stripe Payout ID で埋める（照合のバックアップ経路用）
            stripe_payout_id = COALESCE(stripe_payout_id, ${params.stripePayoutId})
        WHERE (
            stripe_payout_id = ${params.stripePayoutId}
            OR id = ${params.payoutId}::uuid
          )
          AND status <> 'paid'
        RETURNING id
      `);
      return updated.length > 0;
    },

    // payout.failed を反映する。stripe_payout_id を主・自前 payout 行の id（metadata 由来）を従に照合し、
    // status=failed・failure_reason を記録し、この payout で paid になった tip を payable へ戻す
    // （payout_id=null・settlement_status=payable）。既に failed なら何もしない（冪等）。1トランザクションで原子的に行う。
    async markPayoutFailedAndRevertTips(params, failureReason) {
      const db = getDb();
      return await db.transaction(async (tx) => {
        // 対象 payout を failed に確定する（stripe_payout_id か 自前 id で照合・まだ failed でなければ）
        const updated = await tx.execute<{ id: string }>(sql`
          UPDATE payout
          SET status = 'failed',
              failure_reason = ${failureReason},
              stripe_payout_id = COALESCE(stripe_payout_id, ${params.stripePayoutId})
          WHERE (
              stripe_payout_id = ${params.stripePayoutId}
              OR id = ${params.payoutId}::uuid
            )
            AND status <> 'failed'
          RETURNING id
        `);
        const payoutRow = updated[0];
        if (!payoutRow) {
          // 既に failed・該当なし → 何もしない（冪等）
          return false;
        }

        // この payout で paid になった tip を payable へ戻す（紐付けも解除）
        await tx.execute(sql`
          UPDATE tip
          SET settlement_status = 'payable',
              payout_id = NULL
          WHERE payout_id = ${payoutRow.id}::uuid
            AND settlement_status = 'paid'
        `);

        return true;
      });
    },

    // (d) 送金を stripe_payout_id（主）/ 自前 id（従）で照合し、台帳追記に必要な
    //   自前 payout 行 id・Stripe Payout ID・Connected Account ID（送金元店員の口座）を取得する。
    async findPayoutForLedger(params) {
      const db = getDb();
      const rows = await db.execute<{
        payoutId: string;
        stripePayoutId: string | null;
        connectedAccountId: string | null;
      }>(sql`
        SELECT
          p.id                AS "payoutId",
          p.stripe_payout_id  AS "stripePayoutId",
          s.stripe_account_id AS "connectedAccountId"
        FROM payout p
        JOIN staff s ON s.id = p.staff_id
        WHERE (
            p.stripe_payout_id = ${params.stripePayoutId}
            OR p.id = ${params.payoutId}::uuid
          )
        LIMIT 1
      `);
      return rows[0] ?? null;
    },

    // (d) ある payout 行に紐づく（paid 化した）tip を、台帳追記の素材として取得する。
    //   手動送金は balance_transactions?payout= で内訳を引けないため、DB の確定リンク（tip.payout_id）を源泉にする。
    //   (c) で鏡保存した balance_transaction_id / charge_id と額面を返す。
    async listPaidTipsForPayout(payoutId) {
      const db = getDb();
      const rows = await db.execute<{
        tipId: string;
        balanceTransactionId: string | null;
        stripeChargeId: string | null;
        amount: number;
      }>(sql`
        SELECT
          id                     AS "tipId",
          balance_transaction_id AS "balanceTransactionId",
          stripe_charge_id       AS "stripeChargeId",
          amount                 AS "amount"
        FROM tip
        WHERE payout_id = ${payoutId}::uuid
        ORDER BY COALESCE(succeeded_at, created_at) ASC
      `);
      return rows;
    },

    // (d) charge ID（ch_…）から自前 tip の id を逆引きする（台帳の payout⇄bt⇄tip 対応付け用）。
    async findTipIdByChargeId(chargeId) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        SELECT id AS "id"
        FROM tip
        WHERE stripe_charge_id = ${chargeId}
        LIMIT 1
      `);
      return rows[0]?.id ?? null;
    },

    // (d) 照合台帳（payout_ledger）へ追記する（append-only・上書き禁止）。
    //   同一 (payout_id, balance_transaction_id) は二重追記しない（payout.paid の再送・突合の重複に冪等）。
    //   既存行は決して UPDATE / DELETE しない。新しい対応だけを INSERT する。追記件数を返す。
    async appendPayoutLedgerEntries(payoutId, entries) {
      if (entries.length === 0) return 0;
      const db = getDb();
      let appended = 0;
      // 1件ずつ「まだ無ければ追記」する（balance_transaction_id 単位で冪等）。台帳は不変なので INSERT のみ。
      for (const e of entries) {
        const rows = await db.execute<{ id: string }>(sql`
          INSERT INTO payout_ledger (
            payout_id, balance_transaction_id, stripe_charge_id, tip_id, amount, type
          )
          SELECT
            ${payoutId}::uuid, ${e.balanceTransactionId}, ${e.stripeChargeId},
            ${e.tipId}::uuid, ${e.amount}, ${e.type}
          WHERE NOT EXISTS (
            SELECT 1 FROM payout_ledger pl
            WHERE pl.payout_id = ${payoutId}::uuid
              AND pl.balance_transaction_id IS NOT DISTINCT FROM ${e.balanceTransactionId}
              AND pl.tip_id IS NOT DISTINCT FROM ${e.tipId}::uuid
          )
          RETURNING id AS "id"
        `);
        if (rows.length > 0) appended += 1;
      }
      return appended;
    },

    // (e) 日次照合バッチ用: Connected Account を持つ店員ごとに DB 側の合計を集約する（全件スキャンしない）。
    //   手取りは floor(amount * 0.85)（= application_fee=15% 控除後の連結残高と1円一致・#11）を SQL で合算する。
    //   返金・チャージバック（refunded/disputed）は除外する（Stripe 側でも残高から外れるため）。
    async listReconcileTotalsByStaff() {
      const db = getDb();
      const rows = await db.execute<ReconcileStaffTotals>(sql`
        SELECT
          s.id                AS "staffId",
          s.stripe_account_id AS "connectedAccountId",
          -- paid な tip の手取り合計（Stripe の成立 payout 合計と突き合わせる）
          COALESCE(SUM(
            CASE WHEN t.settlement_status = 'paid'
                 THEN FLOOR(t.amount * 0.85) ELSE 0 END
          ), 0)::int          AS "paidTakeTotal",
          -- held+payable な tip の手取り合計（Stripe balance(available+pending) と突き合わせる）
          COALESCE(SUM(
            CASE WHEN t.settlement_status IN ('held', 'payable')
                 THEN FLOOR(t.amount * 0.85) ELSE 0 END
          ), 0)::int          AS "unsettledTakeTotal",
          -- 進行中（pending）の自前 payout 件数
          (SELECT COUNT(*)::int FROM payout p
            WHERE p.staff_id = s.id AND p.status = 'pending') AS "pendingPayoutCount",
          -- 決済未確定（pending）の tip 件数（succeeded 集計とは別軸なので独立サブクエリで数える）
          (SELECT COUNT(*)::int FROM tip tp
            WHERE tp.staff_id = s.id AND tp.status = 'pending') AS "pendingTipCount"
        FROM staff s
        LEFT JOIN tip t
          ON t.staff_id = s.id
          AND t.status = 'succeeded'
          AND t.settlement_status NOT IN ('refunded', 'disputed')
        WHERE s.stripe_account_id IS NOT NULL
        GROUP BY s.id, s.stripe_account_id
      `);
      return rows;
    },

    // (f) 補正エントリ1件を照合台帳へ追記する（append-only）。
    //   返金・異議・送金失敗などの補正は、既存行を書き換えず新しい行として記録する（不変台帳）。
    async appendLedgerCorrection(params) {
      const db = getDb();
      const rows = await db.execute<{ id: string }>(sql`
        INSERT INTO payout_ledger (
          payout_id, balance_transaction_id, stripe_charge_id, tip_id, amount, type
        ) VALUES (
          ${params.payoutId}::uuid, NULL, ${params.stripeChargeId},
          ${params.tipId}::uuid, ${params.amount}, ${params.type}
        )
        RETURNING id AS "id"
      `);
      return rows[0]!.id;
    },
  };
}
