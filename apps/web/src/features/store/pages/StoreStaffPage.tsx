import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreStaff, useStoreInvites } from "../hooks/useStore.js";

/**
 * スタッフ一覧画面（/store/staff）。モック03に対応。
 * 在籍中のスタッフを名簿順で表示し、「招待中」タブで招待一覧へ移動できる。
 * QR は店員さん本人が発行する主体のため、店側はここで発行しない（在籍管理のみ）。
 * 金額・受取件数のランキングは表示しない。
 */
export function StoreStaffPage() {
  return <StoreGuard>{(store) => <StoreStaffContent store={store} />}</StoreGuard>;
}

function StoreStaffContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const staffQuery = useStoreStaff(store.id);
  // 招待中（pending）の件数をタブに出すため招待一覧も取得する
  const invitesQuery = useStoreInvites(store.id);

  const staff = staffQuery.data?.items ?? [];
  const activeCount = staffQuery.data?.count ?? 0;
  const pendingCount = invitesQuery.data?.pendingCount ?? 0;

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-3 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store" })}
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
        <span className="text-token-2xl font-bold text-ink">{t("store.staffTitle")}</span>
      </div>

      {/* タブ（在籍中 / 招待中） */}
      <div className="flex flex-none gap-7 px-6 pt-1.5">
        <div className="border-b-[2.5px] border-rose pb-2.5">
          <span className="text-token-md font-bold text-rose">
            {t("store.staffTabActive")} ({activeCount})
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/store/invites" })}
          className="border-b-[2.5px] border-transparent pb-2.5"
        >
          <span className="text-token-md font-semibold text-muted">
            {t("store.staffTabInvited")} ({pendingCount})
          </span>
        </button>
      </div>
      <div className="h-px flex-none bg-line-soft" />

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-1.5">
        {staff.length === 0 ? (
          <div className="mt-8 text-center text-token-sm text-muted">{t("store.staffEmpty")}</div>
        ) : (
          staff.map((s, i) => (
            <div key={s.id}>
              <div className="flex items-center gap-3.5 px-1 py-4">
                <div className="flex h-[46px] w-[46px] flex-none items-center justify-center overflow-hidden rounded-full bg-rose-soft text-token-sm text-muted">
                  {s.avatarUrl ? (
                    <img
                      src={s.avatarUrl}
                      alt={s.displayName}
                      className="h-[46px] w-[46px] rounded-full object-cover"
                    />
                  ) : (
                    "員"
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-token-lg font-bold text-ink">{s.displayName}</div>
                  {s.headline && (
                    <div className="mt-0.5 text-token-sm text-muted">{s.headline}</div>
                  )}
                </div>
                {/* 右端の山括弧（モック03のリスト行）。装飾的なので淡色 */}
                <span className="flex-none text-muted-soft" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
              {i < staff.length - 1 && <div className="h-px bg-line-soft" />}
            </div>
          ))
        )}

        {/* スタッフを招待する */}
        <button
          type="button"
          onClick={() => navigate({ to: "/store/invites/new" })}
          className="mt-5 block w-full rounded-xl border-[1.5px] border-rose-spark py-4 text-center text-token-md font-bold text-rose"
        >
          {t("store.staffInviteCta")}
        </button>
      </div>

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}
