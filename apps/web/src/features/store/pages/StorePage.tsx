import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../../staff/hooks/useAuthSession.js";
import { useMyStore } from "../hooks/useStore.js";
import { StoreLoginPage } from "./StoreLoginPage.js";
import { StoreSetupPage } from "./StoreSetupPage.js";
import { StoreHomePage } from "./StoreHomePage.js";

/**
 * 店画面の入口（/store）と認証ゲート。
 * セッションと所有する店（GET /store/me）の状態を見て、出す画面を一元的に出し分ける:
 *  - 未ログイン              → ログイン画面
 *  - ログイン済み・店未紐付け  → 導入セットアップ（claim）画面
 *  - ログイン済み・紐付け済み  → 店ホーム
 * 認証情報の取得中はローディング表示にして、画面のちらつきを防ぐ。
 */
export function StorePage() {
  const { t } = useTranslation();
  // Supabase セッション（ログイン状態）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分が所有する店（ログイン済みのときだけ取得）
  const storeQuery = useMyStore(isAuthenticated);

  // セッション確定前はローディング
  if (authLoading) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 未ログインならログイン画面へ
  if (!isAuthenticated) {
    return <StoreLoginPage />;
  }

  // 店取得中はローディング
  if (storeQuery.isLoading) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 未紐付け（初回ログイン）なら導入セットアップへ
  if (!storeQuery.data) {
    return <StoreSetupPage />;
  }

  // 紐付け済みならホームを表示
  return <StoreHomePage store={storeQuery.data} />;
}

/**
 * 店画面のローディング表示（スマホ枠内で中央寄せ）。
 */
function StoreLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}
