import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";
import { useMyStore } from "../hooks/useStore.js";
import { StoreSetupPage } from "./StoreSetupPage.js";
import { StoreHomePage } from "./StoreHomePage.js";

/**
 * 店画面の入口（/store）と認証ゲート。
 * セッションと所有する店（GET /store/me）の状態を見て、出す画面を一元的に出し分ける:
 *  - 未ログイン              → ログイン画面
 *  - ログイン済み・店未作成    → 店舗作成（セルフサーブ）画面
 *  - ログイン済み・作成済み    → 店ホーム
 * 認証情報の取得中はローディング表示にして、画面のちらつきを防ぐ。
 */
export function StorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Supabase セッション（ログイン状態）
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分が所有する店（ログイン済みのときだけ取得）
  const storeQuery = useMyStore(isAuthenticated);

  // 未ログインなら統合ログイン画面（/login）へ送る（ログイン入口を1画面に集約したため）
  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  // セッション確定前・未ログイン（/login へ送る前）はローディング
  if (authLoading || !isAuthenticated) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 店取得中はローディング
  if (storeQuery.isLoading) {
    return <StoreLoading label={t("store.loading")} />;
  }

  // 未作成（初回ログイン）なら店舗作成画面へ
  if (!storeQuery.data) {
    return <StoreSetupPage />;
  }

  // 作成済みならホームを表示
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
