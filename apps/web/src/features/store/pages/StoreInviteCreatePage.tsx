import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { STORE_INVITE_LABEL_MAX_LENGTH } from "@arigato/shared";
import type { StoreProfile, StoreInviteCreated } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useCreateStoreInvite } from "../hooks/useStore.js";

/**
 * スタッフ招待（リンク発行）画面（/store/invites/new）。
 * 「招待リンクを発行」で一意の招待リンク（/invite/:code）を生成する（方式A）。
 * このリンクから登録した店員さんは自動で自店に所属する。
 * 発行は1アクションなのでステッパーは置かず、発行後はリンク・コピー・招待中一覧への導線だけを出す。
 */
export function StoreInviteCreatePage() {
  return <StoreGuard>{(store) => <StoreInviteCreateContent store={store} />}</StoreGuard>;
}

function StoreInviteCreateContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateStoreInvite(store.id);

  const [issued, setIssued] = useState<StoreInviteCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 招待者名（任意メモ・label）。空欄でも発行できる（無記名の招待）
  const [label, setLabel] = useState("");

  // 招待リンクを発行する（招待者名があれば label として送る。空欄は無記名）
  const handleIssue = () => {
    setError(null);
    const trimmed = label.trim();
    createMutation.mutate(trimmed === "" ? undefined : trimmed, {
      onSuccess: (invite) => setIssued(invite),
      onError: () => setError(t("store.inviteError")),
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
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-4 pt-2">
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
        <span className="text-token-2xl font-bold text-ink">{t("store.inviteTitle")}</span>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-7 pb-6 pt-2.5">
        {/* 封筒アイコン */}
        <div className="mt-6 flex justify-center">
          <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
            <rect x="10" y="22" width="100" height="68" rx="8" fill="#fde8ee" />
            <path
              d="M10 30 L60 64 L110 30"
              stroke="#ec3a6d"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 折り返しの側面ライン（封筒） */}
            <path
              d="M10 90 L48 56 M110 90 L72 56"
              stroke="#ec3a6d"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="60" cy="34" r="16" fill="#ec3a6d" />
            {/* 封筒の上のハート（感謝のしるし） */}
            <path
              d="M55 34a4 4 0 0 1 4-4h2a4 4 0 0 1 0 8M65 34a4 4 0 0 1-4 4h-2a4 4 0 0 1 0-8"
              stroke="#fff"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {!issued ? (
          <>
            <div className="mt-6 whitespace-pre-line text-center text-token-2xl font-bold leading-snug text-ink">
              {t("store.inviteHeading")}
            </div>
            <div className="mt-3.5 whitespace-pre-line text-center text-token-base leading-relaxed text-ink-sub">
              {t("store.inviteLead")}
            </div>

            {/* 招待者名（任意メモ・label）。招待中一覧で誰宛か見分けるためのメモ。空欄でも発行可 */}
            <div className="mt-7">
              <label htmlFor="invite-label" className="block text-token-base font-bold text-ink-label">
                {t("store.inviteLabelLabel")}
              </label>
              <input
                id="invite-label"
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
              {/* スタッフ一覧の「招待中」タブへ遷移する */}
              <button
                type="button"
                onClick={() => navigate({ to: "/store/staff", search: { tab: "invited" } })}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-md font-semibold text-ink-label"
              >
                {t("store.inviteSeeList")}
              </button>
            </div>
          </>
        )}
      </div>

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}
