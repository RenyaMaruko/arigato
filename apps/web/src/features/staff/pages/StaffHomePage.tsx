import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { StaffMe } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { signOut } from "../../../lib/auth.js";

/**
 * 店員さんホーム（ログイン後の起点・/staff）。
 * 自分の表示名・一言・所属店・本人確認の状態を表示し、QR発行・プロフィール編集へ導く。
 * 受取履歴・保留残高・本人確認オンボーディングの本実装は Sprint 5 に委ねる
 * （ここでは表示の枠と起点のみ）。
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
        <div className="mt-1 text-center text-token-md text-ink-sub">{me.storeName}</div>
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

        {/* 主要アクション（QR発行・残高・受取履歴・プロフィール編集・申告データ） */}
        <div className="mt-7 flex flex-col gap-[11px]">
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/qr" })}
            className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("staff.homeQr")}
          </button>
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
