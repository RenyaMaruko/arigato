import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { StaffMe } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";

/**
 * 店員さんホーム（ログイン後の起点・/staff）。
 * モック01のトーン（中央アバター・ローズ淡色のステータスカード・機能アイコングリッド・下部ボトムナビ）を
 * 踏襲しつつ、多対多モデル（掛け持ち）に合わせて「所属しているお店」を一覧で見せ、店ごとの別QRへ導く。
 *
 * 多対多モデル: 所属（membership）は複数持てる。各店ごとに別QR（/tip/:membershipId）を貼るため、
 * 店ごとにQRボタンを並べ、?m= で対象 membership を QR 画面に渡す。
 * ホームでは残高金額は持たないため、ステータスカードは「本人確認の状態」を見せて残高画面へ導く。
 * ログアウトは設定画面（/staff/settings）へ移設したため、ホーム上部の操作行は持たない（モック01に準拠）。
 */
export function StaffHomePage({ me }: { me: StaffMe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 本人確認の状態（verified / pending / none）。カードの色と文言を出し分ける
  const verified = me.identityStatus === "verified";
  const pending = me.identityStatus === "pending";
  const identityLabel = verified
    ? t("staff.identityVerified")
    : pending
      ? t("staff.identityPending")
      : t("staff.identityNone");

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-7 pt-3">
        {/* アバター（ローズの淡いリングで包む。モック01の中央アバター） */}
        <div className="flex justify-center">
          <div className="rounded-full bg-rose-soft p-1">
            <div className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-full bg-stamp-bg text-token-sm text-muted ring-2 ring-page">
              {me.avatarUrl ? (
                <img
                  src={me.avatarUrl}
                  alt={me.displayName}
                  className="h-[92px] w-[92px] rounded-full object-cover"
                />
              ) : (
                "顔写真"
              )}
            </div>
          </div>
        </div>

        {/* 名前・「さん」（モック01の中央タイトル） */}
        <div className="mt-3.5 text-center">
          <span className="text-token-3xl font-bold text-ink">{me.displayName} </span>
          <span className="text-token-md text-ink">{t("staff.san")}</span>
        </div>
        {me.headline && (
          <div className="mt-1 text-center text-token-md text-ink-sub">{me.headline}</div>
        )}

        {/* ステータスカード（モック01の残高カードのトーン）。本人確認の状態を見せ、残高画面へ導く。
            ホームは残高金額を持たないため、金額の代わりに状態と次の一歩を示す */}
        <button
          type="button"
          onClick={() => navigate({ to: "/staff/balance" })}
          className={
            verified
              ? "mt-[22px] flex w-full items-center justify-between rounded-2xl border border-line-soft bg-surface-subtle px-4 py-4 text-left"
              : "mt-[22px] flex w-full items-center justify-between rounded-2xl border border-rose-spark/50 bg-rose-soft px-4 py-4 text-left"
          }
        >
          <div className="min-w-0">
            <div className={verified ? "text-token-sm text-ink-sub" : "text-token-sm text-rose/80"}>
              {t("staff.homeStatusLabel")}
            </div>
            <div
              className={
                verified
                  ? "mt-1 text-token-lg font-bold text-ink"
                  : "mt-1 text-token-lg font-bold text-rose"
              }
            >
              {identityLabel}
            </div>
            {!verified && (
              <div className="mt-1 text-token-xs text-rose/70">{t("staff.homeStatusNote")}</div>
            )}
          </div>
          <span
            className={
              verified
                ? "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-stamp-bg text-ink-sub"
                : "flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-rose-spark/40 text-rose"
            }
          >
            <ClockIcon />
          </span>
        </button>

        {/* 所属しているお店（複数可・掛け持ち）。各店ごとに別QR（/tip/:membershipId）へ導く */}
        <div className="mt-7">
          <div className="text-token-base font-bold text-ink-label">
            {t("staff.homeStoresLabel")}
          </div>
          {me.memberships.length === 0 ? (
            // 所属がまだ無いとき（招待リンクからの参加を促す）
            <div className="mt-3 rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-5 text-center text-token-sm leading-relaxed text-ink-sub">
              {t("staff.homeNoStores")}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {me.memberships.map((m) => (
                // 1店ぶんのカード（店アイコン＋店名＋その店のQRを表示する導線）
                <div
                  key={m.membershipId}
                  className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-page px-4 py-3"
                >
                  {/* 店のしるし（ローズ淡色の丸） */}
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-rose">
                    <StoreIcon />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-token-md font-semibold text-ink">
                    {m.storeName}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/staff/qr", search: { m: m.membershipId } })}
                    className="flex flex-none items-center gap-1.5 rounded-lg bg-rose px-3.5 py-2 text-token-sm font-bold text-page"
                  >
                    <QrIcon />
                    {t("staff.homeStoreQr")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 機能アイコングリッド（モック01）。受取履歴・口座登録・データ出力・プロフィール編集へ導く */}
        <div className="mt-8 grid grid-cols-3 gap-x-2 gap-y-6">
          <FeatureTile
            label={t("staff.homeHistory")}
            onClick={() => navigate({ to: "/staff/history" })}
            icon={<HistoryIcon />}
          />
          <FeatureTile
            label={t("staff.homeBalance")}
            onClick={() => navigate({ to: "/staff/balance" })}
            icon={<WalletIcon />}
          />
          <FeatureTile
            label={t("staff.homeAccount")}
            onClick={() => navigate({ to: "/staff/identity" })}
            icon={<CardIcon />}
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
        </div>
      </div>

      {/* 下部ボトムナビ（モック01・現在地＝ホーム） */}
      <StaffBottomNav active="home" />
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

/** 時計アイコン（保留＝時間で着金可能になる、の含意）。 */
function ClockIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
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

/** QR アイコン（店ごとのQRを表示）。 */
function QrIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <path d="M14 14h3v3M21 14v7M17 21h4M14 18.5v2.5" />
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

/** 残高（財布）アイコン。 */
function WalletIcon() {
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
      <rect x="3" y="6" width="18" height="13" rx="2.4" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 口座登録（カード）アイコン。 */
function CardIcon() {
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
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19" />
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
