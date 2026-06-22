import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { signOut } from "../../../lib/auth.js";
import { useClaimStore } from "../hooks/useStore.js";

/**
 * 導入セットアップ画面（ログイン済みだが店が未紐付けのときに表示）。
 * 運営から案内された店舗IDを入力し、このアカウントに店を紐付ける（claim）。
 * 紐付けが完了すると店ホームへ進む。
 */
export function StoreSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const claimMutation = useClaimStore();

  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = storeId.trim() !== "" && !claimMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    claimMutation.mutate(storeId.trim(), {
      // 成功したら店ホームへ
      onSuccess: () => navigate({ to: "/store" }),
      onError: (err) => {
        const code = err instanceof Error ? err.message : "";
        // 店が無い・既に他者が利用中（404）は専用メッセージ
        if (code === "store_not_found") setError(t("store.setupNotFound"));
        else setError(t("store.setupError"));
      },
    });
  };

  // ログアウト（別アカウントでやり直す導線）
  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/store" });
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
            {t("store.logout")}
          </button>
        </div>

        {/* 見出し */}
        <div className="mt-6 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("store.setupTitle")}</div>
          <div className="mt-3 whitespace-pre-line text-token-md leading-relaxed text-ink-sub">
            {t("store.setupLead")}
          </div>
        </div>

        {/* 店舗ID 入力フォーム */}
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
          <label className="text-token-sm text-ink-sub" htmlFor="store-id">
            {t("store.setupStoreIdLabel")}
          </label>
          <input
            id="store-id"
            type="text"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder={t("store.setupStoreIdPlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {error && (
            <div className="mt-4 rounded-xl bg-rose-soft px-4 py-3 text-token-sm text-rose">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-7 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
          >
            {claimMutation.isPending ? t("store.loading") : t("store.setupSubmit")}
          </button>
        </form>
      </div>
    </PhoneFrame>
  );
}
