import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe } from "../hooks/useStaff.js";
import { signOut } from "../../../lib/auth.js";

/**
 * 店員さんの設定画面（/staff/settings・モック10）。
 * プロフィール編集・本人確認/口座登録・申告データ出力への導線と、ログアウトをまとめる。
 * ログアウトはこれまでホーム上部のハンバーガーにあった処理を、モックに沿ってここへ移設したもの。
 * 認証ゲートは他の staff 画面と同じ作法（未ログイン・未作成は入口へ戻す）。
 */
export function StaffSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分のプロフィール（未作成・未ログインなら入口へ戻す）
  const meQuery = useStaffMe(isAuthenticated);

  // 未ログイン・未作成なら入口（認証ゲート）へ戻す（描画中の setState を避けるため副作用で）
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // ログアウトしてログイン画面（同じ /staff のログイン前状態）へ戻す
  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/staff" });
  };

  // 認証情報の取得中・リダイレクト待ちはローディング表示
  if (authLoading || (isAuthenticated && meQuery.isLoading) || !meQuery.data) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("staff.loading")}
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      {/* タイトル */}
      <div className="flex-none bg-page px-5 pb-4 pt-2 text-center">
        <span className="text-token-2xl font-bold text-ink">{t("staff.settingsTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-subtle px-5 pb-6 pt-4">
        {/* アカウント系のグループ（プロフィール・本人確認/口座・申告データ） */}
        <div className="overflow-hidden rounded-2xl bg-page shadow-sm">
          <SettingRow
            label={t("staff.settingsProfile")}
            onClick={() => navigate({ to: "/staff/profile" })}
            icon={
              <>
                <circle cx="12" cy="8" r="4" />
                <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("staff.settingsIdentity")}
            onClick={() => navigate({ to: "/staff/identity" })}
            icon={
              <>
                <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                <path d="M2.5 9.5h19" />
              </>
            }
          />
          <Divider />
          <SettingRow
            label={t("staff.settingsExport")}
            onClick={() => navigate({ to: "/staff/export" })}
            icon={
              <>
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
                <path d="M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
              </>
            }
          />
        </div>

        {/*
          店の管理・開設への暫定導線（フェーズ1）。
          ログイン後は全員この店員ホーム側に着地するが、店を持つ人／これから開設する人が
          /store へ到達できる経路を最低1つ残すためのもの。
          本格的なモード切替 UX（兼任者のみ表示・owner 判定）はフェーズ3で作るため、ここは最小の暫定リンク。
        */}
        <div className="mt-6 overflow-hidden rounded-2xl bg-page shadow-sm">
          <SettingRow
            label={t("staff.settingsStoreAdmin")}
            onClick={() => navigate({ to: "/store" })}
            icon={
              <>
                <path d="M3 9l1.5-5h15L21 9" />
                <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
                <path d="M9 20v-6h6v6" />
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
          {t("staff.logout")}
        </button>
      </div>

      <StaffBottomNav active="settings" />
    </PhoneFrame>
  );
}

/**
 * 設定の1行（アイコン・ラベル・右シェブロン）。
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
      <span className="text-muted">
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
