import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { StaffMe } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { signOut } from "../../../lib/auth.js";

/**
 * 店員さんホーム（ログイン後の起点・/staff）。
 * 自分の表示名・一言・本人確認の状態を表示し、所属店一覧（複数可・掛け持ち）と
 * 店ごとのQRへの導線・プロフィール編集・受取履歴・残高・申告データへ導く。
 *
 * 多対多モデル: 所属（membership）は複数持てる。各店ごとに別QR（/tip/:membershipId）を貼るため、
 * 店ごとにQRボタンを並べ、?m= で対象 membership を QR 画面に渡す。
 */
export function StaffHomePage({ me }: { me: StaffMe }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 本人確認の状態を文言に変換する
  const identityLabel =
    me.identityStatus === "verified"
      ? t("staff.identityVerified")
      : me.identityStatus === "pending"
        ? t("staff.identityPending")
        : t("staff.identityNone");

  // ログアウトしてログイン画面（同じ /staff のログイン前状態）へ戻す
  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/staff" });
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 上部: ログアウト */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="text-token-sm text-ink-sub underline-offset-2 hover:underline"
          >
            {t("staff.logout")}
          </button>
        </div>

        {/* アバター・名前・店名（ローズの淡いリングで包む） */}
        <div className="mt-2 flex justify-center">
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
        <div className="mt-3.5 text-center">
          <span className="text-token-3xl font-bold text-ink">{me.displayName} </span>
          <span className="text-token-md text-ink">{t("staff.san")}</span>
        </div>
        {me.headline && (
          <div className="mt-1 text-center text-token-md text-muted">{me.headline}</div>
        )}

        {/* 本人確認の状態（Sprint 4 は表示のみ。本実装は Sprint 5）。ローズ淡色のカードで状態を示す */}
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-rose-spark/40 bg-rose-soft px-4 py-3 text-center text-token-sm font-semibold text-rose">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          {identityLabel}
        </div>

        {/* 所属店一覧（複数可・掛け持ち）。各店ごとに別QR（/tip/:membershipId）へ導く */}
        <div className="mt-7">
          <div className="text-token-base font-bold text-ink-label">
            {t("staff.homeStoresLabel")}
          </div>
          {me.memberships.length === 0 ? (
            // 所属がまだ無いとき（招待リンクからの参加を促す）
            <div className="mt-3 rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-4 text-center text-token-sm text-ink-sub">
              {t("staff.homeNoStores")}
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {me.memberships.map((m) => (
                // 1店ぶんのカード（店名＋その店のQRを表示する導線）
                <div
                  key={m.membershipId}
                  className="flex items-center justify-between gap-3 rounded-xl border-[1.5px] border-line bg-page px-4 py-3.5"
                >
                  <span className="min-w-0 flex-1 truncate text-token-md font-semibold text-ink">
                    {m.storeName}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/staff/qr", search: { m: m.membershipId } })}
                    className="flex-none rounded-lg bg-rose px-4 py-2 text-token-sm font-bold text-page"
                  >
                    {t("staff.homeStoreQr")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 主要アクション（残高・受取履歴・プロフィール編集・申告データ） */}
        <div className="mt-7 flex flex-col gap-[11px]">
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/balance" })}
            className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
          >
            {t("staff.homeBalance")}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/history" })}
            className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
          >
            {t("staff.homeHistory")}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/profile" })}
            className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-lg font-semibold text-ink"
          >
            {t("staff.homeProfile")}
          </button>
          {/* 申告データ（CSV）への控えめな導線 */}
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/export" })}
            className="mt-1 text-center text-token-sm text-ink-sub underline-offset-2 hover:underline"
          >
            {t("staff.exportLink")}
          </button>
        </div>
      </div>
    </PhoneFrame>
  );
}
