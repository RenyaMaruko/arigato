import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { StaffMe } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { shouldShowWelcomeTutorial } from "../../../lib/tutorial-visibility.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { WelcomeTutorial } from "../components/WelcomeTutorial.js";
import { useStaffBalance } from "../hooks/useStaff.js";

/**
 * 店員さんホーム（ログイン後の起点・/staff）。
 * モック01のトーン（中央アバター・ローズ淡色の残高カード・機能アイコングリッド・下部ボトムナビ）を
 * 踏襲しつつ、多対多モデル（掛け持ち）に合わせて「所属しているお店」を一覧で見せ、店ごとの別QRへ導く。
 *
 * 多対多モデル: 所属（membership）は複数持てる。各店ごとに別QR（/tip/:membershipId）を貼るため、
 * 店ごとにQRボタンを並べ、?m= で対象 membership を QR 画面に渡す。
 * 残高カード: 受け取った投げ銭は本人確認の有無に関係なく保留残高（held）として溜まるため、
 * 本人スコープの残高API（GET /staff/me/balance）から保留残高を主役に・着金可能額（payable）を併記する。
 * 着金（銀行送金）には本人確認が要る関係を、本人確認前の一言＋残高画面への導線で示す。
 * 金額表示はこの本人画面のみ（横断ルール: 金額は本人のみ。店向け経路には出さない）。
 * ログアウトは設定画面（/staff/settings）へ移設したため、ホーム上部の操作行は持たない（モック01に準拠）。
 */
export function StaffHomePage({ me }: { me: StaffMe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 保留残高サマリ（本人のみ）。このページはログイン済み＋プロフィール取得済みのときだけ描画されるため有効化する
  const balanceQuery = useStaffBalance(true);
  const balance = balanceQuery.data;
  // 残高を取得できたか。読み込み中は 0 を出さずプレースホルダにして、0→実値のチラつきを防ぐ
  const balanceReady = balance !== undefined;
  // 未取得・ローディング時は 0 として扱い計算を崩さない（表示は balanceReady で出し分ける）
  const heldAmount = balance?.heldAmount ?? 0;
  const payableAmount = balance?.payableAmount ?? 0;
  // 送金できる額＝Stripe の実 available（#5: 送金可能額の正）。未確認・残高取得前は 0
  const sendableAmount = balance?.sendableAmount ?? 0;
  // 着金可能（本人確認済み）かどうかは残高API の canPayout を正とする（プロフィールの identityStatus と整合）
  const verified = balance?.canPayout ?? me.identityStatus === "verified";
  // 本人確認の状態（残高API を正・未取得時はプロフィールで代替）
  const identityStatus = balance?.identityStatus ?? me.identityStatus;
  // 本人確認の申請中（オンボーディング提出済み・審査待ち）。ボタンを「ただいま申請中」表示に切り替える
  const identityPending = !verified && identityStatus === "pending";
  // 要対応（審査NG・追加書類）。押せるボタンで /staff/identity へ導き、不足の修正・再提出をしてもらう
  const identityActionRequired = !verified && identityStatus === "action_required";

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-6 pb-7 pt-4">
        {/* 残高カード。受け取った投げ銭の残高（保留＋着金可能の合計）を1つの「残高」として表示する。
            着金（銀行送金）には本人確認が要るため、未確認なら一言＋本人確認ボタンを残高のすぐ下に置く。
            金額は本人のみ表示（横断ルール）。本人の画面なのでアバター・名前・一言は出さない。 */}
        <div className="w-full rounded-2xl border border-rose-spark/50 bg-rose-soft px-5 py-[18px]">
          {/* 残高（保留 held ＋ 着金可能 payable の合計）を主役に大きく見せる */}
          <div className="text-token-sm font-semibold text-rose/80">
            {t("staff.homeBalanceLabel")}
          </div>
          {balanceReady ? (
            <div className="mt-1 text-[30px] font-bold leading-none text-rose">
              ¥{(heldAmount + payableAmount).toLocaleString()}
            </div>
          ) : (
            // 読み込み中はスケルトン（0 をチラ見せしない）
            <div
              className="mt-1.5 h-[26px] w-28 animate-pulse rounded-md bg-rose/20"
              aria-hidden="true"
            />
          )}
          {/* 送金できる条件の一言。
              未確認＝本人確認で送金可能に／確認済＝いま送金できる額（Stripe available）を示す。
              残高（受取総額）は隠さず、そのうち今すぐ送れる額が available であることを伝える。 */}
          <div className="mt-2 text-token-xs text-rose/70">
            {!balanceReady
              ? // 読み込み中は一言も出さない（高さは維持してボタン位置をずらさない）
                " "
              : verified
                ? sendableAmount < heldAmount + payableAmount
                  ? // 受取総額の一部だけが今すぐ送金できる（残りは準備中＝Stripe 確定待ち）
                    t("staff.homeBalanceSendableNote", {
                      amount: `¥${sendableAmount.toLocaleString()}`,
                    })
                  : t("staff.homeBalanceVerifiedNote")
                : identityActionRequired
                  ? // 要対応（審査NG・追加書類）は気づけるよう一言で知らせる
                    t("staff.homeIdentityActionRequiredNote")
                  : identityPending
                    ? // 申請中は審査期間の目安を一言で添える
                      t("staff.homeIdentityPendingNote")
                    : t("staff.homeBalanceToSendNote")}
          </div>

          {/* 残高のすぐ下のアクション。
              確認済み → 送金へ／申請中 → 「ただいま申請中」（押せない状態表示）／未着手 → 本人確認へ。
              申請中でも途中離脱（書類未提出）や追加書類の再開ができるよう、小さな確認リンクだけ残す。 */}
          {verified ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/staff/payout" })}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose py-3 text-token-md font-bold text-page"
            >
              {t("staff.homePayoutCta")}
              <ChevronIcon />
            </button>
          ) : identityActionRequired ? (
            // 要対応（審査NG・追加書類）: 押せるボタンで本人確認画面へ。埋め込み画面が不足・エラー内容を
            // 表示し、修正・再提出できる。注意が伝わるようローズ枠線＋ローズ文字（トークン準拠）にする
            <button
              type="button"
              onClick={() => navigate({ to: "/staff/identity" })}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-rose bg-page py-3 text-token-md font-bold text-rose"
            >
              {t("staff.homeIdentityActionRequiredCta")}
              <ChevronIcon />
            </button>
          ) : identityPending ? (
            // 申請中の状態表示（ボタンではない・押せない）。申請中＝提出済みの審査待ちで、
            // ユーザーがやることは無い（未提出は none のまま・審査NGは action_required になるため導線不要）
            <div className="mt-3.5 flex w-full items-center justify-center rounded-xl bg-rose/40 py-3 text-token-md font-bold text-page">
              {t("staff.homeIdentityPendingCta")}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navigate({ to: "/staff/identity" })}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose py-3 text-token-md font-bold text-page"
            >
              {t("staff.homeVerifyCta")}
              <ChevronIcon />
            </button>
          )}
        </div>

        {/* 所属しているお店（複数可・掛け持ち）。カードをタップで店舗詳細（店ごとのQR）へ導く */}
        <div className="mt-7">
          <div className="text-token-base font-bold text-ink-label">
            {t("staff.homeStoresLabel")}
          </div>
          {me.memberships.length === 0 ? (
            // 所属がまだ無いとき（招待リンクからの参加を促す）
            <div className="mt-3 whitespace-pre-line rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-5 text-center text-token-sm leading-relaxed text-ink-sub">
              {t("staff.homeNoStores")}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {me.memberships.map((m) => (
                // 1店ぶんのカード（タップで店舗詳細＝店ごとのQRへ）
                <button
                  key={m.membershipId}
                  type="button"
                  onClick={() =>
                    navigate({
                      to: "/staff/stores/$membershipId",
                      params: { membershipId: m.membershipId },
                    })
                  }
                  className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-page px-4 py-3.5 text-left"
                >
                  {/* 店のロゴ（未設定はローズ淡色の丸＋建物アイコン） */}
                  <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-rose-soft text-rose">
                    {m.logoUrl ? (
                      <img
                        src={m.logoUrl}
                        alt={m.storeName}
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <StoreIcon />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-token-md font-semibold text-ink">
                    {m.storeName}
                  </span>
                  {/* タップできることを示す右シェブロン */}
                  <span className="flex-none text-muted-soft">
                    <ChevronIcon />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 機能アイコングリッド（モック01）。受取履歴・データ出力・プロフィール編集へ導く。
            送金・本人確認/口座登録は残高カードに一本化したため、重複を避けてグリッドからは外す。 */}
        <div className="mt-8 grid grid-cols-3 gap-x-2 gap-y-6">
          <FeatureTile
            label={t("staff.homeHistory")}
            onClick={() => navigate({ to: "/staff/history" })}
            icon={<HistoryIcon />}
          />
          <FeatureTile
            label={t("staff.exportLink")}
            onClick={() => navigate({ to: "/staff/export" })}
            icon={<ExportIcon />}
          />
          <FeatureTile
            label={t("staff.homeProfile")}
            onClick={() => navigate({ to: "/staff/profile" })}
            icon={<UserIcon />}
          />
          {/* 店舗作成（§11.4）。管理店の有無に関わらず常に表示（何店でも作れる）。
              押すと店作成フロー（/store/new）へ。作成後は店員ホームへ戻り中央ナビ切替が出る。 */}
          <FeatureTile
            label={t("staff.homeCreateStore")}
            onClick={() => navigate({ to: "/store/new" })}
            icon={<StoreCreateIcon />}
          />
        </div>
      </div>

      {/* 下部ボトムナビ（モック01・現在地＝ホーム） */}
      <StaffBottomNav active="home" />

      {/* 初回アカウント作成チュートリアル（welcome・2ステップ）。
          me（ロード済み）の seenTutorials に welcome が無いときだけ1回出す（DB・アカウント紐づけ）。
          閉じると既読化され、この条件が外れて自動的に消える。
          中央ナビのコーチマーク（mode_switch）は welcome 既読まで出ないため2枚重ならない。 */}
      {shouldShowWelcomeTutorial(me.seenTutorials) && <WelcomeTutorial />}
    </PhoneFrame>
  );
}

/**
 * 機能アイコングリッドの1マス（モック01）。
 * ローズのアイコン＋ラベルを縦に並べた控えめなタイル。
 */
function FeatureTile({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 text-rose"
    >
      {icon}
      <span className="text-token-sm text-ink-label">{label}</span>
    </button>
  );
}

/** 右シェブロン（次へ進む含意）。 */
function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** 店（建物）アイコン（所属店のしるし）。 */
function StoreIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5 5.2 5h13.6L20 9.5" />
      <path d="M4 9.5V20h16V9.5" />
      <path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

/** 受取履歴（書類）アイコン。 */
function HistoryIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  );
}

/** データ出力（ダウンロード書類）アイコン。 */
function ExportIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
    </svg>
  );
}

/** 店舗作成（建物＋プラス）アイコン。ホームの「店舗作成」タイルに使う。 */
function StoreCreateIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5 5.2 5h13.6L20 9.5" />
      <path d="M4 9.5V20h9" />
      <path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M17 15v6M14 18h6" />
    </svg>
  );
}

/** プロフィール（人物）アイコン。 */
function UserIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
    </svg>
  );
}
