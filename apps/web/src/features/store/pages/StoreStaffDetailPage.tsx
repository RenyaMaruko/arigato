import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import {
  useStoreStaffDetail,
  useRemoveStoreStaff,
  useRemoveStoreAdmin,
  useTransferStoreOwner,
} from "../hooks/useStore.js";
import { formatDate } from "../utils/format.js";

/**
 * スタッフ詳細画面（/store/staff/:staffId・店スコープ）。
 * スタッフ一覧の行タップで来る。在籍中スタッフの基本情報（表示名・一言・顔写真・参加日）を表示し、
 * 「このスタッフを外す」（在籍解除＝論理削除）を確認ダイアログ付きで行う。
 *
 * 管理者操作（§11.3・owner のみ・対象が管理者(admin)のとき）:
 *  - 「管理者権限を外す」: store_admin を論理削除のみ（店員としては残す＝QR・受取維持）。
 *  - 「このユーザーをオーナーにする」: 明示的な owner 譲渡（既存 transfer-owner）。
 *  - owner 自身には「管理者権限を外す」を出さない（owner を空にできない）。
 *
 * 金額・受取件数は一切表示しない（店はお金に触れない）。お金は移動しない（受け取り済みは本人のもの）。
 */
export function StoreStaffDetailPage() {
  return <StoreGuard>{(store) => <StoreStaffDetailContent store={store} />}</StoreGuard>;
}

// 確認ダイアログの対象アクション（none＝閉じている）
type PendingAction = "removeStaff" | "removeAdmin" | "makeOwner" | null;

function StoreStaffDetailContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL から対象スタッフ ID を受け取る
  const { staffId } = useParams({ from: "/store/staff/$staffId" });
  // スタッフ詳細（在籍中のみ・店スコープ。ロール・閲覧者ロールを含む）
  const detailQuery = useStoreStaffDetail(store.id, staffId);
  // 在籍解除・管理者権限を外す・オーナー譲渡（いずれも確認ダイアログを挟む）
  const removeStaffMutation = useRemoveStoreStaff(store.id);
  const removeAdminMutation = useRemoveStoreAdmin(store.id);
  const transferMutation = useTransferStoreOwner(store.id);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = detailQuery.data;
  // owner だけが管理者操作を出せる。対象が管理者(admin)のときだけ「外す／オーナーにする」を出す。
  // owner 自身（対象が owner）には「管理者権限を外す」を出さない（owner を空にできない）。
  const viewerIsOwner = detail?.viewerRole === "owner";
  const targetIsAdmin = detail?.role === "admin";
  const canManageAdmin = Boolean(viewerIsOwner && targetIsAdmin);

  const busy =
    removeStaffMutation.isPending || removeAdminMutation.isPending || transferMutation.isPending;

  // 確認ダイアログで「実行」を押したときの処理（アクションごとに分岐）
  const handleConfirm = () => {
    if (!detail || !pending) return;
    setError(null);
    if (pending === "removeStaff") {
      removeStaffMutation.mutate(detail.id, {
        onSuccess: () => {
          setPending(null);
          // 在籍解除するとその人は一覧から消えるため一覧へ戻す
          navigate({ to: "/store/staff" });
        },
        onError: () => setError(t("store.staffRemoveError")),
      });
    } else if (pending === "removeAdmin") {
      removeAdminMutation.mutate(detail.authUserId, {
        onSuccess: () => {
          setPending(null);
          // 管理者権限を外しても店員としては残る。管理者タブへ戻して最新を見せる
          navigate({ to: "/store/staff", search: { tab: "admins" } });
        },
        onError: () => setError(t("store.adminsRemoveError")),
      });
    } else if (pending === "makeOwner") {
      transferMutation.mutate(detail.authUserId, {
        onSuccess: () => {
          setPending(null);
          navigate({ to: "/store/staff", search: { tab: "admins" } });
        },
        onError: () => setError(t("store.adminsTransferError")),
      });
    }
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
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
        <span className="text-token-2xl font-bold text-ink">{t("store.staffDetailTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-2">
        {detailQuery.isLoading ? (
          // 取得中（在籍中スタッフの詳細を読み込み中）
          <div className="mt-10 text-center text-token-sm text-muted">{t("store.loading")}</div>
        ) : detailQuery.isError || !detail ? (
          // 取得失敗（脱退済み・他店・存在しない等）はエラー表示
          <div className="mt-10 text-center text-token-sm text-muted">
            {t("store.staffDetailLoadError")}
          </div>
        ) : (
          <>
            {/* 基本情報（顔写真・名前・一言・ロールバッジ） */}
            <div className="flex flex-col items-center pt-4 text-center">
              <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full bg-rose-soft text-token-xl text-muted">
                {detail.avatarUrl ? (
                  <img
                    src={detail.avatarUrl}
                    alt={detail.displayName}
                    className="h-[88px] w-[88px] rounded-full object-cover"
                  />
                ) : (
                  "員"
                )}
              </div>
              <div className="mt-4 text-token-2xl font-bold text-ink">{detail.displayName}</div>
              {/* この店でのロール（owner/admin）を持つ人はバッジを出す（店員のみは出さない） */}
              {detail.role && (
                <span
                  className={`mt-2 inline-block rounded-pill px-2.5 py-[3px] text-token-xs font-bold ${
                    detail.role === "owner" ? "bg-rose-soft text-rose" : "bg-surface-subtle text-ink-sub"
                  }`}
                >
                  {detail.role === "owner"
                    ? t("store.adminsOwnerBadge")
                    : t("store.adminsAdminBadge")}
                </span>
              )}
              {detail.headline ? (
                <div className="mt-2 text-token-sm text-muted">{detail.headline}</div>
              ) : (
                <div className="mt-2 text-token-sm text-muted-soft">
                  {t("store.staffDetailNoHeadline")}
                </div>
              )}
            </div>

            {/* 参加日（その店に在籍し始めた日） */}
            <div className="mt-6 rounded-2xl border-[1.5px] border-line bg-surface-subtle px-5 py-4">
              <div className="text-token-sm text-ink-sub">
                {t("store.staffDetailJoinedAt", { date: formatDate(detail.joinedAt) })}
              </div>
            </div>

            {/* QRを表示（主要アクション。このスタッフの投げ銭QRを表示・印刷する画面へ） */}
            <button
              type="button"
              onClick={() =>
                navigate({ to: "/store/staff/$staffId/qr", params: { staffId: detail.id } })
              }
              className="mt-8 block w-full rounded-xl bg-rose py-4 text-center text-token-md font-bold text-page"
            >
              {t("store.staffQrCta")}
            </button>

            {/* このスタッフを外す（在籍解除・控えめなボタン。実行は確認ダイアログを挟む） */}
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPending("removeStaff");
              }}
              className="mt-3 block w-full rounded-xl border-[1.5px] border-rose-spark py-4 text-center text-token-md font-bold text-rose"
            >
              {t("store.staffRemoveCta")}
            </button>

            {/* 管理者操作（owner のみ・対象が管理者(admin)のとき・§11.3） */}
            {canManageAdmin && (
              <div className="mt-8">
                <div className="text-token-sm font-bold text-ink-label">
                  {t("store.staffDetailAdminSectionTitle")}
                </div>
                <div className="mt-3 flex flex-col gap-2.5">
                  {/* このユーザーをオーナーにする（明示的な owner 譲渡） */}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPending("makeOwner");
                    }}
                    className="block w-full rounded-xl border-[1.5px] border-line bg-page py-3.5 text-center text-token-md font-semibold text-ink-label"
                  >
                    {t("store.staffDetailMakeOwnerCta")}
                  </button>
                  {/* 管理者権限を外す（店員としては残す） */}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPending("removeAdmin");
                    }}
                    className="block w-full rounded-xl border-[1.5px] border-rose-soft bg-page py-3.5 text-center text-token-md font-semibold text-rose"
                  >
                    {t("store.staffDetailRemoveAdminCta")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 確認ダイアログ（下からのシート・アクションごとに文言を出し分ける。
          ドキュメントスクロール方式のためビューポート基準の fixed・アプリ幅 max-w-app に制約） */}
      {pending && detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40">
          <div className="w-full max-w-app rounded-t-2xl bg-page px-6 pb-7 pt-6">
            <h2 className="text-center text-token-lg font-bold text-ink">
              {confirmTitle(pending, t)}
            </h2>
            <p className="mt-3 whitespace-pre-line text-center text-token-sm leading-relaxed text-ink-sub">
              {confirmBody(pending, detail.displayName, t)}
            </p>
            {error && <p className="mt-3 text-center text-token-sm text-rose">{error}</p>}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="rounded-xl bg-rose py-3.5 text-center text-token-md font-bold text-page disabled:opacity-60"
              >
                {busy ? t("store.staffRemoving") : confirmCta(pending, t)}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setPending(null);
                  setError(null);
                }}
                disabled={busy}
                className="py-2 text-center text-token-sm font-semibold text-muted"
              >
                {t("store.staffRemoveCancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      <StoreBottomNav active="staff" />
    </PhoneFrame>
  );
}

// 確認ダイアログの見出しをアクションごとに返す
function confirmTitle(p: NonNullable<PendingAction>, t: (k: string) => string): string {
  switch (p) {
    case "removeStaff":
      return t("store.staffRemoveConfirmTitle");
    case "removeAdmin":
      return t("store.adminsRemoveConfirmTitle");
    case "makeOwner":
      return t("store.adminsTransferConfirmTitle");
  }
}

// 確認ダイアログの本文をアクションごとに返す（対象名を差し込む）
function confirmBody(
  p: NonNullable<PendingAction>,
  name: string,
  t: (k: string, o?: Record<string, string>) => string,
): string {
  switch (p) {
    case "removeStaff":
      return t("store.staffRemoveConfirmBody", { name });
    case "removeAdmin":
      return t("store.adminsRemoveConfirmBody");
    case "makeOwner":
      return t("store.adminsTransferConfirmBody", { name });
  }
}

// 確認ダイアログの実行ボタン文言をアクションごとに返す
function confirmCta(p: NonNullable<PendingAction>, t: (k: string) => string): string {
  switch (p) {
    case "removeStaff":
      return t("store.staffRemoveConfirmCta");
    case "removeAdmin":
      return t("store.adminsRemoveConfirmCta");
    case "makeOwner":
      return t("store.adminsTransferConfirmCta");
  }
}
