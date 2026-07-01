import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StoreProfile, StoreAdminListItem } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import {
  useStoreAdmins,
  useRemoveStoreAdmin,
  useTransferStoreOwner,
  useLeaveStoreAsOwner,
  useCloseStore,
} from "../hooks/useStore.js";

/**
 * 管理者管理画面（/store/admins・店の管理モード内・§3/§5）。
 * その店の管理者（owner/admin）を一覧表示し、owner のときだけ次の操作を出す:
 *  - 管理者を招待（リンク発行・別画面へ）
 *  - 管理者を外す（論理削除・確認あり）
 *  - owner を譲渡（対象 admin を選ぶ・確認あり）
 *  - owner を退任して抜ける（残る管理者がいれば自動昇格・いなければ閉店）
 *  - お店を閉じる（論理削除）
 * 管理者(admin)は一覧の閲覧のみ（owner 専用操作のボタンは出さない）。金額は一切表示しない。
 */
export function StoreAdminsPage() {
  return <StoreGuard>{(store) => <StoreAdminsContent store={store} />}</StoreGuard>;
}

// 確認ダイアログの対象アクション（none＝閉じている）
type PendingAction =
  | { kind: "remove"; admin: StoreAdminListItem }
  | { kind: "transfer"; admin: StoreAdminListItem }
  | { kind: "leave" }
  | { kind: "close" }
  | null;

function StoreAdminsContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const adminsQuery = useStoreAdmins(store.id);
  const removeMutation = useRemoveStoreAdmin(store.id);
  const transferMutation = useTransferStoreOwner(store.id);
  const leaveMutation = useLeaveStoreAsOwner();
  const closeMutation = useCloseStore();

  // 確認ダイアログの状態と、実行時のエラー文言
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = adminsQuery.data?.viewerRole === "owner";
  const items = adminsQuery.data?.items ?? [];

  // 確認ダイアログで「実行」を押したときの処理（アクションごとに分岐）
  const handleConfirm = () => {
    if (!pending) return;
    setError(null);
    if (pending.kind === "remove") {
      removeMutation.mutate(pending.admin.authUserId, {
        onSuccess: () => setPending(null),
        onError: () => setError(t("store.adminsRemoveError")),
      });
    } else if (pending.kind === "transfer") {
      transferMutation.mutate(pending.admin.authUserId, {
        onSuccess: () => setPending(null),
        onError: () => setError(t("store.adminsTransferError")),
      });
    } else if (pending.kind === "leave") {
      // owner 退任。残る管理者がいれば自動昇格・いなければ閉店。どちらも店員モードへ戻す
      leaveMutation.mutate(store.id, {
        onSuccess: () => {
          setPending(null);
          navigate({ to: "/staff" });
        },
        onError: () => setError(t("store.adminsLeaveError")),
      });
    } else if (pending.kind === "close") {
      closeMutation.mutate(store.id, {
        onSuccess: () => {
          setPending(null);
          navigate({ to: "/staff" });
        },
        onError: () => setError(t("store.adminsCloseError")),
      });
    }
  };

  const isBusy =
    removeMutation.isPending ||
    transferMutation.isPending ||
    leaveMutation.isPending ||
    closeMutation.isPending;

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-4 pt-2">
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
        <span className="text-token-2xl font-bold text-ink">{t("store.adminsTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-subtle px-5 pb-6 pt-3">
        <div className="text-token-sm text-ink-sub">{t("store.adminsLead")}</div>

        {/* 読み込みエラー */}
        {adminsQuery.isError && (
          <div className="mt-4 rounded-xl border-[1.5px] border-line bg-page px-4 py-5 text-center text-token-sm text-ink-sub">
            {t("store.adminsLoadError")}
          </div>
        )}

        {/* 管理者一覧 */}
        <div className="mt-4 flex flex-col gap-2.5">
          {items.map((a) => (
            <AdminRow
              key={a.authUserId}
              admin={a}
              // owner だけが admin に対して操作できる（自分自身・owner には操作を出さない）
              canManage={isOwner && a.role === "admin" && !a.isSelf}
              onRemove={() => {
                setError(null);
                setPending({ kind: "remove", admin: a });
              }}
              onTransfer={() => {
                setError(null);
                setPending({ kind: "transfer", admin: a });
              }}
            />
          ))}
        </div>

        {/* owner 専用: 管理者を招待する */}
        {isOwner && (
          <button
            type="button"
            onClick={() => navigate({ to: "/store/admins/invite" })}
            className="mt-5 w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("store.adminsInviteCta")}
          </button>
        )}

        {/* owner 専用: 危険な操作（退任・閉店） */}
        {isOwner && (
          <div className="mt-8">
            <div className="text-token-sm font-bold text-ink-label">
              {t("store.adminsDangerTitle")}
            </div>
            <div className="mt-3 overflow-hidden rounded-2xl bg-page shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPending({ kind: "leave" });
                }}
                className="w-full px-[18px] py-4 text-left text-token-md font-semibold text-ink"
              >
                {t("store.adminsLeaveCta")}
              </button>
              <div className="mx-[18px] h-px bg-line-soft" />
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPending({ kind: "close" });
                }}
                className="w-full px-[18px] py-4 text-left text-token-md font-semibold text-rose"
              >
                {t("store.adminsCloseCta")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 確認ダイアログ（下からのシート） */}
      {pending && (
        <ConfirmSheet
          title={confirmTitle(pending, t)}
          body={confirmBody(pending, t)}
          confirmLabel={confirmCta(pending, t, isBusy)}
          cancelLabel={t("store.adminsRemoveCancel")}
          error={error}
          busy={isBusy}
          danger={pending.kind === "remove" || pending.kind === "close" || pending.kind === "leave"}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (isBusy) return;
            setPending(null);
            setError(null);
          }}
        />
      )}

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}

// 確認ダイアログの見出し文言をアクションごとに返す
function confirmTitle(p: NonNullable<PendingAction>, t: (k: string) => string): string {
  switch (p.kind) {
    case "remove":
      return t("store.adminsRemoveConfirmTitle");
    case "transfer":
      return t("store.adminsTransferConfirmTitle");
    case "leave":
      return t("store.adminsLeaveConfirmTitle");
    case "close":
      return t("store.adminsCloseConfirmTitle");
  }
}

// 確認ダイアログの本文をアクションごとに返す（譲渡は対象名を差し込む）
function confirmBody(
  p: NonNullable<PendingAction>,
  t: (k: string, o?: Record<string, string>) => string,
): string {
  switch (p.kind) {
    case "remove":
      return t("store.adminsRemoveConfirmBody");
    case "transfer":
      return t("store.adminsTransferConfirmBody", {
        name: p.admin.displayName ?? t("store.adminsNoName"),
      });
    case "leave":
      return t("store.adminsLeaveConfirmBody");
    case "close":
      return t("store.adminsCloseConfirmBody");
  }
}

// 確認ダイアログの実行ボタン文言（処理中は「処理中…」）
function confirmCta(
  p: NonNullable<PendingAction>,
  t: (k: string) => string,
  busy: boolean,
): string {
  if (busy) return t("store.adminsRemoving");
  switch (p.kind) {
    case "remove":
      return t("store.adminsRemoveConfirmCta");
    case "transfer":
      return t("store.adminsTransferConfirmCta");
    case "leave":
      return t("store.adminsLeaveConfirmCta");
    case "close":
      return t("store.adminsCloseConfirmCta");
  }
}

/**
 * 管理者一覧の1行（アバター・名前・ロールバッジ・owner 専用操作）。
 */
function AdminRow({
  admin,
  canManage,
  onRemove,
  onTransfer,
}: {
  admin: StoreAdminListItem;
  canManage: boolean;
  onRemove: () => void;
  onTransfer: () => void;
}) {
  const { t } = useTranslation();
  const isOwner = admin.role === "owner";
  return (
    <div className="rounded-xl border-[1.5px] border-line bg-page px-4 py-3.5">
      <div className="flex items-center gap-3">
        {/* アバター（未設定はローズ淡色の丸＋人アイコン） */}
        <span className="flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-full bg-rose-soft text-rose">
          {admin.avatarUrl ? (
            <img
              src={admin.avatarUrl}
              alt={admin.displayName ?? ""}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <svg
              width="20"
              height="20"
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
            <span className="truncate text-token-md font-semibold text-ink">
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

      {/* owner 専用操作（対象が admin かつ自分以外のとき） */}
      {canManage && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onTransfer}
            className="flex-1 rounded-lg border-[1.5px] border-line bg-page py-2.5 text-center text-token-sm font-semibold text-ink-label"
          >
            {t("store.adminsTransferCta")}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 rounded-lg border-[1.5px] border-rose-soft bg-page py-2.5 text-center text-token-sm font-semibold text-rose"
          >
            {t("store.adminsRemoveCta")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 下からせり出す確認シート（外す・譲渡・退任・閉店の共通ダイアログ）。
 */
function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  error,
  busy,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  error: string | null;
  busy: boolean;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-ink/40" onClick={onCancel}>
      <div
        className="w-full rounded-t-2xl bg-page px-5 pb-7 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center text-token-lg font-bold text-ink">{title}</div>
        <div className="mt-2.5 whitespace-pre-line text-center text-token-sm leading-relaxed text-ink-sub">
          {body}
        </div>
        {error && <div className="mt-3 text-center text-token-sm text-rose">{error}</div>}
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl py-3.5 text-center text-token-md font-bold text-page disabled:opacity-60 ${
              danger ? "bg-rose" : "bg-rose"
            }`}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border-[1.5px] border-line bg-page py-3.5 text-center text-token-md font-semibold text-ink-label disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
