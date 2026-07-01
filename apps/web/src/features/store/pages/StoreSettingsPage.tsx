import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { signOut } from "../../../lib/auth.js";

/**
 * 設定画面（/store/settings）。モック07に対応。
 * 店舗プロフィール・スタッフ招待管理・導入承認などへの導線をまとめる。
 * 金額・残高・着金に関する項目は一切置かない（店はお金に触れない）。
 */
export function StoreSettingsPage() {
  return <StoreGuard>{() => <StoreSettingsContent />}</StoreGuard>;
}

function StoreSettingsContent() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/store" });
  };

  return (
    <PhoneFrame>
      {/* タイトル */}
      <div className="flex-none px-5 pb-4 pt-2 text-center">
        <span className="text-token-2xl font-bold text-ink">{t("store.settingsTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-subtle px-5 pb-6 pt-4">
        {/* 運用系のグループ */}
        <div className="overflow-hidden rounded-2xl bg-page shadow-sm">
          <SettingRow
            label={t("store.settingsProfile")}
            onClick={() => navigate({ to: "/store/profile" })}
            icon={
              <>
                <rect x="4" y="4" width="16" height="16" rx="2.4" />
                <path d="M4 9h16M9 4v16" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("store.settingsStaff")}
            onClick={() => navigate({ to: "/store/staff" })}
            icon={
              <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
              </>
            }
          />
          <Divider />
          {/* 管理者（owner/admin の一覧・招待・削除・owner 譲渡）。owner のみ操作は一覧画面側で出し分ける */}
          <SettingRow
            label={t("store.settingsAdmins")}
            onClick={() => navigate({ to: "/store/admins" })}
            icon={
              <>
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c0-3.2 2.6-5 5.5-5s5.5 1.8 5.5 5" />
                <path d="M16 8.5a2.6 2.6 0 1 0 0-1M17 14c2.2.3 3.8 1.8 3.8 4.2" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("store.settingsApproval")}
            onClick={() => navigate({ to: "/store/approval" })}
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 12.5 11 15l5-5.5" />
              </>
            }
          />
        </div>

        {/* 情報系のグループ */}
        <div className="mt-4 overflow-hidden rounded-2xl bg-page shadow-sm">
          <SettingRow
            label={t("store.settingsFaq")}
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.8-1.2 1.6v.5" />
                <circle cx="12" cy="17" r="0.6" fill="currentColor" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("store.settingsTerms")}
            icon={
              <>
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("store.settingsPrivacy")}
            icon={
              <>
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
              </>
            }
          />
        </div>

        {/* モード切替（店の管理 → 店員モード）。店の管理は兼任者のみ到達するため常に出してよい（§4） */}
        <div className="mt-6 overflow-hidden rounded-2xl bg-page shadow-sm">
          <SettingRow
            label={t("store.settingsStaffMode")}
            onClick={() => navigate({ to: "/staff" })}
            icon={
              <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
              </>
            }
          />
        </div>

        {/* ログアウト */}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 w-full rounded-2xl bg-page py-4 text-center text-token-md font-semibold text-rose shadow-sm"
        >
          {t("store.logout")}
        </button>
      </div>

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}

/**
 * 設定の1行（アイコン・ラベル・右シェブロン）。onClick が無い項目は遷移しない（プレースホルダ）。
 */
function SettingRow({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3.5 px-[18px] py-4 text-left disabled:opacity-100"
    >
      <span className="text-lang">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icon}
        </svg>
      </span>
      <span className="flex-1 text-token-lg text-ink">{label}</span>
      <span className="text-muted-soft">
        <svg
          width="18"
          height="18"
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
      </span>
    </button>
  );
}

/**
 * 設定の区切り線（左右に余白を取った薄い線）。
 */
function Divider() {
  return <div className="mx-[18px] h-px bg-line-soft" />;
}
