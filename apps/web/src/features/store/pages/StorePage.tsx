import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";
import { useActiveStore } from "../hooks/useActiveStore.js";
import { StoreSetupPage } from "./StoreSetupPage.js";
import { StoreHomePage } from "./StoreHomePage.js";

/**
 * 店画面の入口（/store）と認証ゲート。
 * セッションと「自分が管理する店の一覧（GET /store/mine）」から選択中の店を解決し、出す画面を出し分ける:
 *  - 未ログイン              → ログイン画面
 *  - ログイン済み・管理店なし  → 店舗作成（セルフサーブ）画面（初回開設）
 *  - ログイン済み・管理店あり  → 選択中の店の店ホーム（複数店なら中央ナビで切り替えた店）
 * 選択店の解決（selectedStoreId・1件なら自動）と店プロフィール取得は useActiveStore に集約する（§11.4）。
 * 認証情報の取得中はローディング表示にして、画面のちらつきを防ぐ。
 */
export function StorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Supabase セッション（ログイン状態）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 選択中の店（管理店一覧＋選択解決＋店プロフィール取得）
  const { managedQuery, hasManagedStore, storeQuery } = useActiveStore(isAuthenticated);

  // 未ログインなら統合ログイン画面（/login）へ送る（ログイン入口を1画面に集約したため）
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  // セッション確定前・未ログイン（/login へ送る前）はローディング
  if (authLoading || !isAuthenticated) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 管理店一覧の取得中はローディング
  if (managedQuery.isLoading) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 管理する店が無い（初回）なら店舗作成画面へ
  if (!hasManagedStore) {
    return <StoreSetupPage />;
  }

  // 選択店のプロフィール取得中はローディング
  if (storeQuery.isLoading || !storeQuery.data) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 選択中の店の店ホームを表示
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
