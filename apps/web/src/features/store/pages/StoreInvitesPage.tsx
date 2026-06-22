import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile, StoreInviteItem } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreInvites } from "../hooks/useStore.js";
import { formatDate } from "../utils/format.js";

/**
 * 招待中の一覧画面（/store/invites）。モック05に対応。
 * 発行済みの招待を新しい順に表示する（招待中 / 所属確定 / 失効）。
 * 招待リンクから店員さんが登録すると、その招待は「所属確定（accepted）」になる。
 */
export function StoreInvitesPage() {
  return <StoreGuard>{(store) => <StoreInvitesContent store={store} />}</StoreGuard>;
}

function StoreInvitesContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invitesQuery = useStoreInvites(store.id);

  const items = invitesQuery.data?.items ?? [];
  const pendingCount = invitesQuery.data?.pendingCount ?? 0;

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-3 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/staff" })}
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
        <span className="text-token-2xl font-bold text-ink">{t("store.invitesTitle")}</span>
      </div>

      {/* タブ（招待中 N） */}
      <div className="flex flex-none gap-7 px-6 pt-1.5">
        <div className="border-b-[2.5px] border-rose pb-2.5">
          <span className="text-token-md font-bold text-rose">
            {t("store.staffTabInvited")} ({pendingCount})
          </span>
        </div>
      </div>
      <div className="h-px flex-none bg-line-soft" />

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-2.5">
        {items.length === 0 ? (
          <div className="mt-8 text-center text-token-sm text-muted">{t("store.invitesEmpty")}</div>
        ) : (
          items.map((inv, i) => (
            <div key={inv.code}>
              <InviteRow invite={inv} />
              {i < items.length - 1 && <div className="h-px bg-line-soft" />}
            </div>
          ))
        )}

        {/* 新しく招待する */}
        <button
          type="button"
          onClick={() => navigate({ to: "/store/invites/new" })}
          className="mt-6 block w-full rounded-xl border-[1.5px] border-rose-spark py-4 text-center text-token-md font-bold text-rose"
        >
          {t("store.invitesNewInvite")}
        </button>
      </div>

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}

/**
 * 招待1件の行（アバター・状態・発行日 or 所属確定）。
 */
function InviteRow({ invite }: { invite: StoreInviteItem }) {
  const { t } = useTranslation();

  // 状態ラベルと色（招待中=ローズ / 所属確定=ink / 失効=muted）
  const statusLabel =
    invite.status === "accepted"
      ? t("store.inviteStatusAccepted")
      : invite.status === "revoked"
        ? t("store.inviteStatusRevoked")
        : t("store.inviteStatusPending");
  // 状態バッジの配色（招待中=ローズ塗り / 所属確定=淡グレー枠 / 失効=最も淡い）
  const statusBadge =
    invite.status === "accepted"
      ? "bg-line-soft text-ink-label"
      : invite.status === "revoked"
        ? "bg-surface-subtle text-muted-soft"
        : "bg-rose-soft text-rose";

  return (
    <div className="flex items-center gap-3.5 px-1 py-4">
      <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full bg-rose-soft text-token-sm text-muted">
        員
      </div>
      <div className="flex-1">
        {/* 所属確定なら所属した店員名、未確定なら状態ラベル */}
        <div className="text-token-lg font-bold text-ink">
          {invite.status === "accepted" && invite.acceptedStaffName
            ? invite.acceptedStaffName
            : statusLabel}
        </div>
        <div className="mt-0.5 text-token-sm text-muted">
          {t("store.invitesIssuedAt", { date: formatDate(invite.createdAt) })}
        </div>
      </div>
      <span
        className={`flex-none rounded-pill px-2.5 py-1 text-token-xs font-bold ${statusBadge}`}
      >
        {statusLabel}
      </span>
    </div>
  );
}
