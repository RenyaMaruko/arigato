import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../../../lib/use-auth-session.js";
import { useActiveStore } from "../hooks/useActiveStore.js";

/**
 * 店サブ画面（承認・スタッフ・招待・感謝・設定・プロフィール）の共通ガード。
 * 認証と「選択中の店」の解決を一括で行い、解決できた店（StoreProfile）を children に渡す。
 * 複数店舗（§11.4）に対応し、中央ナビで選んだ店（selectedStoreId・1件なら自動）を useActiveStore で解決する。
 * これにより各サブ画面は「選択中の店だけを操作する」前提を満たせる（店スコープ）。
 *
 * - 未ログイン        → 統合ログイン（/login）へ。
 * - 管理する店が無い  → 店員ホーム（/staff）へ（全員デフォルトは店員ホーム・開設導線はホームにある）。
 */
export function StoreGuard({ children }: { children: (store: StoreProfile) => ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const { managedQuery, hasManagedStore, storeQuery } = useActiveStore(isAuthenticated);

  // 未ログインは統合ログインへ・管理する店が無ければ店員ホームへ戻す
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      navigate({ to: "/login" });
      return;
    }
    if (!managedQuery.isLoading && !hasManagedStore) {
      navigate({ to: "/staff" });
    }
  }, [authLoading, isAuthenticated, managedQuery.isLoading, hasManagedStore, navigate]);

  // 取得中はローディング（一覧取得中・選択店プロフィール取得中）
  if (
    authLoading ||
    (isAuthenticated && (managedQuery.isLoading || (hasManagedStore && storeQuery.isLoading)))
  ) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("store.loading")}
        </div>
      </PhoneFrame>
    );
  }

  // 解決できなければ何も描かない（上の useEffect が入口へ送る）
  if (!isAuthenticated || !hasManagedStore || !storeQuery.data) {
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
