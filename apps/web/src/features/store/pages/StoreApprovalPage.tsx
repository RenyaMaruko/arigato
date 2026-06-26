import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { formatDate } from "../utils/format.js";

/**
 * 導入承認の状態画面（/store/approval）。
 * 店はセルフサーブ作成時に導入承認へ同意するため、ここは運営審査のゲートではなく
 * 「いつ導入承認に同意したか」を確認する読み取り専用の表示にする（就業規則との整合の記録）。
 * 金額・残高は一切扱わない。
 */
export function StoreApprovalPage() {
  return <StoreGuard>{(store) => <StoreApprovalContent store={store} />}</StoreGuard>;
}

function StoreApprovalContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 作成時に同意済みのはず（adoptionAgreedAt が入っている）
  const agreed = store.adoptionAgreedAt != null;

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
        {/* ステータスカード（導入承認に同意済みであることを示す） */}
        <div className="rounded-2xl border border-line-soft p-7 text-center shadow-sm">
          <div className="flex justify-center">
            <span className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-rose-soft text-rose">
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
            </span>
          </div>
          <div className="mt-4 text-token-3xl font-bold text-rose">
            {t("store.approvalApprovedTitle")}
          </div>
          <div className="mt-3 whitespace-pre-line text-token-md leading-relaxed text-ink-label">
            {t("store.approvalApprovedSub")}
          </div>
        </div>

        {/* 同意の記録（就業規則との整合） */}
        <div className="mt-5 rounded-2xl border border-line-soft p-6 shadow-sm">
          <div className="text-token-lg font-bold text-ink">{t("store.approvalCardTitle")}</div>
          <div className="mt-3 whitespace-pre-line text-token-base leading-relaxed text-ink-sub">
            {t("store.approvalCardBody")}
          </div>
          {agreed && store.adoptionAgreedAt && (
            <div className="mt-4 rounded-xl bg-surface-subtle px-4 py-3 text-token-sm text-ink-sub">
              {t("store.approvalAgreedAt", { date: formatDate(store.adoptionAgreedAt) })}
            </div>
          )}
        </div>
      </div>

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}
