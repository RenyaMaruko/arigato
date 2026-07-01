import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { STORE_INVITE_LABEL_MAX_LENGTH } from "@arigato/shared";
import type { StoreProfile, StoreInviteCreated } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useCreateStoreAdminInvite } from "../hooks/useStore.js";

/**
 * 管理者招待（リンク発行）画面（/store/admins/invite・owner のみ・§3.2）。
 * 「招待リンクを発行」で type='admin' の招待リンク（/invite/:code）を生成する。
 * このリンクから参加した人は、このお店の管理者（store_admin role=admin）になる。
 * owner でないアカウントが発行 API を叩いても 404 になるため、owner だけがこの導線に来る（一覧画面から）。
 */
export function StoreAdminInviteCreatePage() {
  return <StoreGuard>{(store) => <StoreAdminInviteCreateContent store={store} />}</StoreGuard>;
}

function StoreAdminInviteCreateContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateStoreAdminInvite(store.id);

  const [issued, setIssued] = useState<StoreInviteCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 招待者名（任意メモ・label）。空欄でも発行できる（無記名の招待）
  const [label, setLabel] = useState("");

  // 管理者招待リンクを発行する（招待者名があれば label として送る。空欄は無記名）
  const handleIssue = () => {
    setError(null);
    const trimmed = label.trim();
    createMutation.mutate(trimmed === "" ? undefined : trimmed, {
      onSuccess: (invite) => setIssued(invite),
      onError: () => setError(t("store.adminInviteError")),
    });
  };

  // 招待リンクをクリップボードへコピー
  const handleCopy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピー不可の環境では何もしない（リンク自体は画面に表示済み）
    }
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る＝管理者一覧へ） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-4 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/admins" })}
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
        <span className="text-token-2xl font-bold text-ink">{t("store.adminInviteTitle")}</span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-7 pb-6 pt-2.5">
        {/* 管理者アイコン（人＋歯車風） */}
        <div className="mt-6 flex justify-center">
          <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
            <rect x="10" y="22" width="100" height="68" rx="8" fill="#fde8ee" />
            <circle cx="60" cy="46" r="13" fill="#ec3a6d" />
            <path
              d="M40 78c0-11 9-18 20-18s20 7 20 18"
              stroke="#ec3a6d"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="60" cy="46" r="5" fill="#fff" />
          </svg>
        </div>

        {!issued ? (
          <>
            <div className="mt-6 whitespace-pre-line text-center text-token-2xl font-bold leading-snug text-ink">
              {t("store.adminInviteHeading")}
            </div>
            <div className="mt-3.5 whitespace-pre-line text-center text-token-base leading-relaxed text-ink-sub">
              {t("store.adminInviteLead")}
            </div>

            {/* 招待者名（任意メモ・label）。招待中一覧で誰宛か見分けるためのメモ。空欄でも発行可 */}
            <div className="mt-7">
              <label
                htmlFor="admin-invite-label"
                className="block text-token-base font-bold text-ink-label"
              >
                {t("store.inviteLabelLabel")}
              </label>
              <input
                id="admin-invite-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={STORE_INVITE_LABEL_MAX_LENGTH}
                placeholder={t("store.inviteLabelPlaceholder")}
                className="mt-2 w-full rounded-lg border-[1.5px] border-line bg-page px-3.5 py-3 text-token-md text-ink placeholder:text-muted-soft focus:border-rose focus:outline-none"
              />
              <div className="mt-2 text-token-xs leading-relaxed text-muted">
                {t("store.inviteLabelHelp")}
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-9">
              <button
                type="button"
                onClick={handleIssue}
                disabled={createMutation.isPending}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
              >
                {createMutation.isPending ? t("store.inviteIssuing") : t("store.inviteIssue")}
              </button>
              {error && <div className="text-center text-token-sm text-rose">{error}</div>}
            </div>
          </>
        ) : (
          <>
            <div className="mt-6 text-center text-token-2xl font-bold text-ink">
              {t("store.inviteIssuedTitle")}
            </div>
            {/* 招待者名（入れていれば表示。無記名なら出さない） */}
            {issued.label && (
              <div className="mt-2 text-center text-token-md font-semibold text-ink-label">
                {issued.label}
              </div>
            )}
            {/* 発行された招待リンク */}
            <div className="mt-5 break-all rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-4 text-token-sm text-ink">
              {issued.inviteUrl}
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-9">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {copied ? t("store.inviteCopied") : t("store.inviteCopy")}
              </button>
              {/* 管理者一覧へ戻る */}
              <button
                type="button"
                onClick={() => navigate({ to: "/store/admins" })}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-md font-semibold text-ink-label"
              >
                {t("store.adminsTitle")}
              </button>
            </div>
          </>
        )}
      </div>

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}
