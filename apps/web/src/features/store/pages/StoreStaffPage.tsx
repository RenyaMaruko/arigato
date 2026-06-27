import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { StoreProfile, StoreInviteItem } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreStaff, useStoreInvites } from "../hooks/useStore.js";
import { formatDate } from "../utils/format.js";

/**
 * スタッフ一覧画面（/store/staff）。
 * 「在籍中 / 招待中」タブを同一画面内で切り替え、タブ下のリスト部分だけが入れ替わる
 * （画面遷移はしない）。?tab=invited を付けると招待中タブを初期表示する（招待発行後の導線）。
 * QR は店員さん本人が発行する主体のため、店側はここで発行しない。
 * 金額・受取件数のランキングは表示しない。
 * 招待中タブの行は全て pending（招待中）で、タップするとリンク再コピー画面へ遷移する。
 */
export function StoreStaffPage() {
  return <StoreGuard>{(store) => <StoreStaffContent store={store} />}</StoreGuard>;
}

// 表示中のタブ（在籍中 / 招待中）
type StaffTab = "active" | "invited";

function StoreStaffContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ?tab=invited で初期タブを指定できる（招待発行後に招待中タブを開く導線）
  const search = useSearch({ from: "/store/staff" });
  const staffQuery = useStoreStaff(store.id);
  const invitesQuery = useStoreInvites(store.id);

  // どちらのタブを表示しているか（URL の ?tab を初期値にし、以降は同一画面でリストだけ差し替える）
  const [tab, setTab] = useState<StaffTab>(search.tab === "invited" ? "invited" : "active");

  const staff = staffQuery.data?.items ?? [];
  const activeCount = staffQuery.data?.count ?? 0;
  const invites = invitesQuery.data?.items ?? [];
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

      {/* タブ（在籍中 / 招待中）。押しても画面遷移せず、下のリストだけ切り替える */}
      <div className="flex flex-none gap-7 px-6 pt-1.5">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={
            tab === "active"
              ? "border-b-[2.5px] border-rose pb-2.5"
              : "border-b-[2.5px] border-transparent pb-2.5"
          }
        >
          <span
            className={
              tab === "active"
                ? "text-token-md font-bold text-rose"
                : "text-token-md font-semibold text-muted"
            }
          >
            {t("store.staffTabActive")} ({activeCount})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("invited")}
          className={
            tab === "invited"
              ? "border-b-[2.5px] border-rose pb-2.5"
              : "border-b-[2.5px] border-transparent pb-2.5"
          }
        >
          <span
            className={
              tab === "invited"
                ? "text-token-md font-bold text-rose"
                : "text-token-md font-semibold text-muted"
            }
          >
            {t("store.staffTabInvited")} ({pendingCount})
          </span>
        </button>
      </div>
      <div className="h-px flex-none bg-line-soft" />

      {/* タブ下の中身（在籍中 or 招待中）だけが切り替わる */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-1.5">
        {tab === "active" ? (
          <>
            {staff.length === 0 ? (
              <div className="mt-8 text-center text-token-sm text-muted">
                {t("store.staffEmpty")}
              </div>
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
                    {/* 右端の山括弧（リスト行）。装飾的なので淡色 */}
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
          </>
        ) : (
          <>
            {invites.length === 0 ? (
              <div className="mt-8 text-center text-token-sm text-muted">
                {t("store.invitesEmpty")}
              </div>
            ) : (
              invites.map((inv, i) => (
                <div key={inv.code}>
                  {/* 招待中（pending）の行。タップでリンク再コピー画面へ遷移する */}
                  <InviteRow
                    invite={inv}
                    onClick={() =>
                      navigate({ to: "/store/invites/$code", params: { code: inv.code } })
                    }
                  />
                  {i < invites.length - 1 && <div className="h-px bg-line-soft" />}
                </div>
              ))
            )}
          </>
        )}

        {/* スタッフを招待する（招待発行画面へ） */}
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

/**
 * 招待1件の行（招待中・pending のみ）。タップでリンク再コピー画面へ遷移する。
 * 招待者名（label）があれば名前位置に出し、無記名なら状態ラベル（招待中）を出す。
 */
function InviteRow({ invite, onClick }: { invite: StoreInviteItem; onClick: () => void }) {
  const { t } = useTranslation();

  // 招待中タブは pending のみ。名前位置は label（招待者名）→ 状態ラベル（招待中）の優先順
  const primaryName =
    invite.label && invite.label.trim() !== "" ? invite.label : t("store.inviteStatusPending");

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 px-1 py-4 text-left"
    >
      <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-rose-soft text-token-sm text-muted">
        員
      </div>
      <div className="flex-1">
        {/* 名前位置：招待者名（label）→ 状態ラベル（招待中） */}
        <div className="text-token-lg font-bold text-ink">{primaryName}</div>
        <div className="mt-0.5 text-token-sm text-muted">
          {t("store.invitesIssuedAt", { date: formatDate(invite.createdAt) })}
        </div>
      </div>
      {/* 状態バッジ（招待中） */}
      <span className="flex-none rounded-pill bg-rose-soft px-2.5 py-1 text-token-xs font-bold text-rose">
        {t("store.inviteStatusPending")}
      </span>
      {/* 右端の山括弧（タップ可能を示す） */}
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
    </button>
  );
}
