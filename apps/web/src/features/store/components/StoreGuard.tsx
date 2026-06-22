import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";
import { useMyStore } from "../hooks/useStore.js";

/**
 * 店サブ画面（承認・スタッフ・招待・感謝・設定・プロフィール）の共通ガード。
 * 認証と所有店の取得を一括で行い、未ログイン・店未紐付けのときは入口（/store）へ送る。
 * 解決できた店（StoreProfile）を children に渡し、各画面はそのまま使う。
 * これにより各サブ画面は「自分の店だけを操作する」前提を満たせる（店スコープ）。
 */
export function StoreGuard({ children }: { children: (store: StoreProfile) => ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const storeQuery = useMyStore(isAuthenticated);

  // 未ログイン・店未紐付けは入口（/store）へ戻す（ログイン/セットアップに誘導）
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate({ to: "/store" });
      return;
    }
    if (!storeQuery.isLoading && !storeQuery.data) {
      navigate({ to: "/store" });
    }
  }, [authLoading, isAuthenticated, storeQuery.isLoading, storeQuery.data, navigate]);

  // 取得中はローディング
  if (authLoading || (isAuthenticated && storeQuery.isLoading)) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("store.loading")}
        </div>
      </PhoneFrame>
    );
  }

  // 解決できなければ何も描かない（上の useEffect が入口へ送る）
  if (!isAuthenticated || !storeQuery.data) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("store.loading")}
        </div>
      </PhoneFrame>
    );
  }

  return <>{children(storeQuery.data)}</>;
}
