import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe } from "../hooks/useStaff.js";
import { StaffLoginPage } from "./StaffLoginPage.js";
import { StaffProfileCreatePage } from "./StaffProfileCreatePage.js";
import { StaffHomePage } from "./StaffHomePage.js";

/**
 * 店員さん画面の入口（/staff）と認証ゲート。
 * セッションとプロフィール（GET /staff/me）の状態を見て、出す画面を一元的に出し分ける:
 *  - 未ログイン            → ログイン画面
 *  - ログイン済み・未作成   → プロフィール作成画面
 *  - ログイン済み・作成済み → ホーム
 * 認証情報の取得中はローディング表示にして、画面のちらつきを防ぐ。
 */
export function StaffPage() {
  const { t } = useTranslation();
  // Supabase セッション（ログイン状態）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分のプロフィール（ログイン済みのときだけ取得）
  const meQuery = useStaffMe(isAuthenticated);

  // セッション確定前はローディング（ガードのちらつき防止）
  if (authLoading) {
    return <StaffLoading label={t("staff.loading")} />;
  }

  // 未ログインならログイン画面へ
  if (!isAuthenticated) {
    return <StaffLoginPage />;
  }

  // プロフィール取得中はローディング
  if (meQuery.isLoading) {
    return <StaffLoading label={t("staff.loading")} />;
  }

  // 未作成（初回ログイン）ならプロフィール作成へ
  if (!meQuery.data) {
    return <StaffProfileCreatePage />;
  }

  // 作成済みならホームを表示
  return <StaffHomePage me={meQuery.data} />;
}

/**
 * 店員さん画面のローディング表示（スマホ枠内で中央寄せ）。
 */
function StaffLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}
