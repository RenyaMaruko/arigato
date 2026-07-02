import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { StoreProfile, StoreInviteItem, StoreAdminListItem } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import {
  useStoreStaff,
  useStoreInvites,
  useStoreAdmins,
  useLeaveStoreAsOwner,
  useCloseStore,
} from "../hooks/useStore.js";
import { formatDate } from "../utils/format.js";

/**
 * スタッフ画面（/store/staff・§11.2 タブ再編）。
 * 「在籍中 / 招待中 / 管理者」の3タブを同一画面内で切り替え、下のリスト部分だけが入れ替わる。
 *  - 在籍中: その店の全 active スタッフ（owner/admin も店員として含む）。
 *  - 招待中: スタッフ招待＋管理者招待の両方（種類ラベル付き）。
 *  - 管理者: owner＋admin（owner は「オーナー」バッジ）。owner のみ危険な操作（退任・閉店）を出す。
 * ?tab=invited / ?tab=admins で初期タブを指定できる（発行後・設定からの導線）。
 * 招待発行は統合フロー（/store/invites/new）で種類を選ぶ。金額・受取件数のランキングは表示しない。
 */
export function StoreStaffPage() {
  return <StoreGuard>{(store) => <StoreStaffContent store={store} />}</StoreGuard>;
}

// 表示中のタブ（在籍中 / 招待中 / 管理者）
type StaffTab = "active" | "invited" | "admins";

// owner の危険な操作の確認対象（none＝閉じている）
type OwnerAction = { kind: "leave" } | { kind: "close" } | null;

function StoreStaffContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ?tab=invited / ?tab=admins で初期タブを指定できる
  const search = useSearch({ from: "/store/staff" });
  const staffQuery = useStoreStaff(store.id);
  const invitesQuery = useStoreInvites(store.id);
  const adminsQuery = useStoreAdmins(store.id);
  const leaveMutation = useLeaveStoreAsOwner();
  const closeMutation = useCloseStore();

  // どのタブを表示しているか（URL の ?tab を初期値にし、以降は同一画面でリストだけ差し替える）
  const initialTab: StaffTab =
    search.tab === "invited" ? "invited" : search.tab === "admins" ? "admins" : "active";
  const [tab, setTab] = useState<StaffTab>(initialTab);
  // owner の危険な操作（退任・閉店）の確認シート
  const [ownerAction, setOwnerAction] = useState<OwnerAction>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);

  const staff = staffQuery.data?.items ?? [];
  const activeCount = staffQuery.data?.count ?? 0;
  const invites = invitesQuery.data?.items ?? [];
  const pendingCount = invitesQuery.data?.pendingCount ?? 0;
  const admins = adminsQuery.data?.items ?? [];
  const adminCount = admins.length;
  const isOwner = adminsQuery.data?.viewerRole === "owner";

  const ownerBusy = leaveMutation.isPending || closeMutation.isPending;

  // owner の危険な操作（退任・閉店）を実行する。どちらも成功したら店員モードへ戻す
  const handleOwnerConfirm = () => {
    if (!ownerAction) return;
    setOwnerError(null);
    const mutation = ownerAction.kind === "leave" ? leaveMutation : closeMutation;
    mutation.mutate(store.id, {
      onSuccess: () => {
        setOwnerAction(null);
        navigate({ to: "/staff" });
      },
      onError: () =>
        setOwnerError(
          ownerAction.kind === "leave"
            ? t("store.adminsLeaveError")
            : t("store.adminsCloseError"),
        ),
    });
  };

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

      {/* タブ（在籍中 / 招待中 / 管理者）。押しても画面遷移せず、下のリストだけ切り替える */}
      <div className="flex flex-none gap-6 px-6 pt-1.5">
        <TabButton
          label={`${t("store.staffTabActive")} (${activeCount})`}
          active={tab === "active"}
          onClick={() => setTab("active")}
        />
        <TabButton
          label={`${t("store.staffTabInvited")} (${pendingCount})`}
          active={tab === "invited"}
          onClick={() => setTab("invited")}
        />
        <TabButton
          label={`${t("store.staffTabAdmins")} (${adminCount})`}
          active={tab === "admins"}
          onClick={() => setTab("admins")}
        />
      </div>
      <div className="h-px flex-none bg-line-soft" />

      {/* タブ下の中身（在籍中 / 招待中 / 管理者）だけが切り替わる */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-1.5">
        {tab === "active" && (
          <>
            {staff.length === 0 ? (
              <div className="mt-8 text-center text-token-sm text-muted">
                {t("store.staffEmpty")}
              </div>
            ) : (
              staff.map((s, i) => (
                <div key={s.id}>
                  {/* スタッフ行。タップでスタッフ詳細（基本情報・在籍解除・管理者操作）へ遷移する */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/store/staff/$staffId", params: { staffId: s.id } })
                    }
                    className="flex w-full items-center gap-3.5 px-1 py-4 text-left"
                  >
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
                    <Chevron />
                  </button>
                  {i < staff.length - 1 && <div className="h-px bg-line-soft" />}
                </div>
              ))
            )}
            <InviteCta onClick={() => navigate({ to: "/store/invites/new" })} label={t("store.staffInviteCta")} />
          </>
        )}

        {tab === "invited" && (
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
            <InviteCta onClick={() => navigate({ to: "/store/invites/new" })} label={t("store.staffInviteCta")} />
          </>
        )}

        {tab === "admins" && (
          <>
            {admins.length === 0 ? (
              <div className="mt-8 text-center text-token-sm text-muted">
                {t("store.adminsTabEmpty")}
              </div>
            ) : (
              admins.map((a, i) => (
                <div key={a.authUserId}>
                  <AdminRow admin={a} />
                  {i < admins.length - 1 && <div className="h-px bg-line-soft" />}
                </div>
              ))
            )}

            {/* owner 専用: 危険な操作（退任・閉店） */}
            {isOwner && (
              <div className="mt-8">
                <div className="text-token-sm font-bold text-ink-label">
                  {t("store.adminsDangerTitle")}
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border-[1.5px] border-line bg-page">
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerError(null);
                      setOwnerAction({ kind: "leave" });
                    }}
                    className="w-full px-[18px] py-4 text-left text-token-md font-semibold text-ink"
                  >
                    {t("store.adminsLeaveCta")}
                  </button>
                  <div className="mx-[18px] h-px bg-line-soft" />
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerError(null);
                      setOwnerAction({ kind: "close" });
                    }}
                    className="w-full px-[18px] py-4 text-left text-token-md font-semibold text-rose"
                  >
                    {t("store.adminsCloseCta")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* owner の危険な操作の確認シート（退任・閉店） */}
      {ownerAction && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/40">
          <div className="w-full rounded-t-2xl bg-page px-6 pb-7 pt-6">
            <h2 className="text-center text-token-lg font-bold text-ink">
              {ownerAction.kind === "leave"
                ? t("store.adminsLeaveConfirmTitle")
                : t("store.adminsCloseConfirmTitle")}
            </h2>
            <p className="mt-3 whitespace-pre-line text-center text-token-sm leading-relaxed text-ink-sub">
              {ownerAction.kind === "leave"
                ? t("store.adminsLeaveConfirmBody")
                : t("store.adminsCloseConfirmBody")}
            </p>
            {ownerError && <p className="mt-3 text-center text-token-sm text-rose">{ownerError}</p>}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleOwnerConfirm}
                disabled={ownerBusy}
                className="rounded-xl bg-rose py-3.5 text-center text-token-md font-bold text-page disabled:opacity-60"
              >
                {ownerBusy
                  ? t("store.adminsRemoving")
                  : ownerAction.kind === "leave"
                    ? t("store.adminsLeaveConfirmCta")
                    : t("store.adminsCloseConfirmCta")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (ownerBusy) return;
                  setOwnerAction(null);
                  setOwnerError(null);
                }}
                disabled={ownerBusy}
                className="py-2 text-center text-token-sm font-semibold text-muted"
              >
                {t("store.adminsRemoveCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}

// タブ見出しボタン（選択中はローズの下線・太字）
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active ? "border-b-[2.5px] border-rose pb-2.5" : "border-b-[2.5px] border-transparent pb-2.5"
      }
    >
      <span
        className={
          active
            ? "text-token-md font-bold text-rose"
            : "text-token-md font-semibold text-muted"
        }
      >
        {label}
      </span>
    </button>
  );
}

// 招待発行への導線ボタン（統合フロー /store/invites/new へ）
function InviteCta({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-5 block w-full rounded-xl border-[1.5px] border-rose-spark py-4 text-center text-token-md font-bold text-rose"
    >
      {label}
    </button>
  );
}

// 右端の山括弧（タップ可能を示す）
function Chevron() {
  return (
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
  );
}

/**
 * 招待1件の行（招待中・pending のみ）。タップでリンク再コピー画面へ遷移する。
 * 招待者名（label）があれば名前位置に出し、無記名なら状態ラベル（招待中）を出す。
 * 種類（スタッフ／管理者）のバッジを併記する（§11.2）。
 */
function InviteRow({ invite, onClick }: { invite: StoreInviteItem; onClick: () => void }) {
  const { t } = useTranslation();

  // 招待中タブは pending のみ。名前位置は label（招待者名）→ 状態ラベル（招待中）の優先順
  const primaryName =
    invite.label && invite.label.trim() !== "" ? invite.label : t("store.inviteStatusPending");
  const isAdmin = invite.type === "admin";

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
      {/* 種類バッジ（スタッフ招待／管理者招待） */}
      <span
        className={`flex-none rounded-pill px-2.5 py-1 text-token-xs font-bold ${
          isAdmin ? "bg-rose text-page" : "bg-rose-soft text-rose"
        }`}
      >
        {isAdmin ? t("store.invitedTypeAdminBadge") : t("store.invitedTypeStaffBadge")}
      </span>
      <Chevron />
    </button>
  );
}

/**
 * 管理者1件の行（管理者タブ・表示専用）。owner は「オーナー」バッジ、admin は「管理者」バッジ。
 * 個別の操作（管理者権限を外す・オーナー譲渡）はスタッフ詳細画面に移設した（§11.3）。
 */
function AdminRow({ admin }: { admin: StoreAdminListItem }) {
  const { t } = useTranslation();
  const isOwner = admin.role === "owner";
  return (
    <div className="flex w-full items-center gap-3.5 px-1 py-4">
      <span className="flex h-[46px] w-[46px] flex-none items-center justify-center overflow-hidden rounded-full bg-rose-soft text-rose">
        {admin.avatarUrl ? (
          <img
            src={admin.avatarUrl}
            alt={admin.displayName ?? ""}
            className="h-[46px] w-[46px] rounded-full object-cover"
          />
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-token-lg font-bold text-ink">
            {admin.displayName ?? t("store.adminsNoName")}
          </span>
          {admin.isSelf && (
            <span className="flex-none text-token-xs text-muted">{t("store.adminsSelf")}</span>
          )}
        </div>
        {/* ロールバッジ（オーナー／管理者） */}
        <span
          className={`mt-1 inline-block rounded-pill px-2 py-[2px] text-token-xs font-bold ${
            isOwner ? "bg-rose-soft text-rose" : "bg-surface-subtle text-ink-sub"
          }`}
        >
          {isOwner ? t("store.adminsOwnerBadge") : t("store.adminsAdminBadge")}
        </span>
      </div>
    </div>
  );
}
