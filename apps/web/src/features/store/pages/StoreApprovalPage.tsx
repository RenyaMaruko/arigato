import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useApproveStore } from "../hooks/useStore.js";

/**
 * 導入・承認画面（/store/approval）。モック08に対応。
 * 店の導入ステータス（承認待ち / 導入済み）を表示し、未承認なら「導入を承認する」で approved に遷移する。
 * 金額・残高は一切扱わない。
 */
export function StoreApprovalPage() {
  return <StoreGuard>{(store) => <StoreApprovalContent store={store} />}</StoreGuard>;
}

function StoreApprovalContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const approveMutation = useApproveStore();
  const [error, setError] = useState<string | null>(null);

  const approved = store.status === "approved";

  // 導入を承認する（pending→approved）
  const handleApprove = () => {
    setError(null);
    approveMutation.mutate(store.id, {
      onError: () => setError(t("store.approvalError")),
    });
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-3 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/settings" })}
          className="text-ink"
          aria-label={t("store.back")}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("store.approvalTitle")}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
        {/* ステータスカード */}
        <div className="rounded-2xl border border-line-soft p-7 text-center shadow-sm">
          <div className="flex justify-center">
            <span
              className={`flex h-[74px] w-[74px] items-center justify-center rounded-full ${
                approved ? "bg-rose-soft text-rose" : "bg-surface-subtle text-muted"
              }`}
            >
              {approved ? (
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8.5 12.5 11 15l5-5.5" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              ) : (
                <svg
                  width="38"
                  height="38"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
              )}
            </span>
          </div>
          <div
            className={`mt-4 text-token-3xl font-bold ${approved ? "text-rose" : "text-ink-label"}`}
          >
            {approved ? t("store.approvalApprovedTitle") : t("store.approvalPendingTitle")}
          </div>
          <div className="mt-3 whitespace-pre-line text-token-md leading-relaxed text-ink-label">
            {approved ? t("store.approvalApprovedSub") : t("store.approvalPendingSub")}
          </div>
        </div>

        {/* 承認アクション（未承認のときのみ） */}
        {!approved && (
          <div className="mt-5 rounded-2xl border border-line-soft p-6 shadow-sm">
            <div className="text-token-lg font-bold text-ink">{t("store.approvalCardTitle")}</div>
            <div className="mt-3 whitespace-pre-line text-token-base leading-relaxed text-ink-sub">
              {t("store.approvalCardBody")}
            </div>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="mt-5 w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
            >
              {approveMutation.isPending ? t("store.approvalApproving") : t("store.approvalButton")}
            </button>
            {error && <div className="mt-3 text-center text-token-sm text-rose">{error}</div>}
          </div>
        )}
      </div>

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}
