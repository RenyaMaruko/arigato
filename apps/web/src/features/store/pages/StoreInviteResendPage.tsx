import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreInvites, useRevokeStoreInvite } from "../hooks/useStore.js";

/**
 * 招待リンクの再コピー画面（/store/invites/:code）。
 * 招待中タブの行タップから来る。その招待の招待者名とリンクを再表示し、コピーし直せる。
 * さらに「この招待を取り消す」で revoke でき、取り消すと招待中一覧（pending のみ）から消える。
 * リンクは招待一覧の item が持つ inviteUrl（サーバが webBaseUrl + /invite/:code で組み立て済み）を使う。
 */
export function StoreInviteResendPage() {
  return <StoreGuard>{(store) => <StoreInviteResendContent store={store} />}</StoreGuard>;
}

function StoreInviteResendContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータの招待コード
  const { code } = useParams({ from: "/store/invites/$code" });
  const invitesQuery = useStoreInvites(store.id);
  const revokeMutation = useRevokeStoreInvite(store.id);

  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 招待中一覧（pending のみ）から該当コードの招待を引く
  const invite = invitesQuery.data?.items.find((i) => i.code === code);

  // 招待リンクをクリップボードへコピー
  const handleCopy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピー不可の環境では何もしない（リンク自体は画面に表示済み）
    }
  };

  // この招待を取り消す（revoke）。成功したら招待中一覧（招待中タブ）へ戻る
  const handleRevoke = () => {
    setError(null);
    revokeMutation.mutate(code, {
      onSuccess: () => navigate({ to: "/store/staff", search: { tab: "invited" } }),
      onError: () => setError(t("store.inviteRevokeError")),
    });
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る＝招待中タブへ） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-4 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/staff", search: { tab: "invited" } })}
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
        <span className="text-token-2xl font-bold text-ink">{t("store.inviteResendTitle")}</span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-7 pb-6 pt-2.5">
        {/* 招待が見つからない（取り消し済み・使用済み）場合の案内 */}
        {invitesQuery.isSuccess && !invite ? (
          <div className="mt-10 text-center text-token-sm leading-relaxed text-muted">
            {t("store.inviteNotFoundResend")}
          </div>
        ) : (
          <>
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
                <path
                  d="M10 90 L48 56 M110 90 L72 56"
                  stroke="#ec3a6d"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                />
                <circle cx="60" cy="34" r="16" fill="#ec3a6d" />
                <path
                  d="M55 34a4 4 0 0 1 4-4h2a4 4 0 0 1 0 8M65 34a4 4 0 0 1-4 4h-2a4 4 0 0 1 0-8"
                  stroke="#fff"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* 招待者名（入れていれば表示。無記名なら出さない） */}
            {invite?.label && (
              <div className="mt-6 text-center text-token-xl font-bold text-ink">
                {invite.label}
              </div>
            )}

            {/* 招待リンク */}
            <div className="mt-5 break-all rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-4 text-token-sm text-ink">
              {invite?.inviteUrl ?? ""}
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-9">
              {/* リンクをコピー */}
              <button
                type="button"
                onClick={handleCopy}
                disabled={!invite}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
              >
                {copied ? t("store.inviteCopied") : t("store.inviteCopy")}
              </button>
              {/* この招待を取り消す（revoke） */}
              <button
                type="button"
                onClick={handleRevoke}
                disabled={!invite || revokeMutation.isPending}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-md font-semibold text-rose disabled:opacity-60"
              >
                {revokeMutation.isPending ? t("store.inviteRevoking") : t("store.inviteRevoke")}
              </button>
              {error && <div className="text-center text-token-sm text-rose">{error}</div>}
            </div>
          </>
        )}
      </div>

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}
