import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreStaffDetail, useRemoveStoreStaff } from "../hooks/useStore.js";
import { formatDate } from "../utils/format.js";

/**
 * スタッフ詳細画面（/store/staff/:staffId・店スコープ）。
 * スタッフ一覧の行タップで来る。在籍中スタッフの基本情報（表示名・一言・顔写真・参加日）を表示し、
 * 「このスタッフを外す」（在籍解除＝論理削除）を確認ダイアログ付きで行う。
 * 金額・受取件数は一切表示しない（店はお金に触れない）。お金は移動しない（受け取り済みは本人のもの）。
 * 在籍解除すると一覧へ戻り、その人は在籍中一覧・記録のスタッフ別から消える。
 */
export function StoreStaffDetailPage() {
  return <StoreGuard>{(store) => <StoreStaffDetailContent store={store} />}</StoreGuard>;
}

function StoreStaffDetailContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL から対象スタッフ ID を受け取る
  const { staffId } = useParams({ from: "/store/staff/$staffId" });
  // スタッフ詳細（在籍中のみ・店スコープ）
  const detailQuery = useStoreStaffDetail(store.id, staffId);
  // 在籍解除（このスタッフを外す）。確認ダイアログの開閉は UI 状態として持つ
  const removeMutation = useRemoveStoreStaff(store.id);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const detail = detailQuery.data;

  // このスタッフを外す（確認ダイアログで実行）。成功したら一覧へ戻す（その人は一覧から消える）。
  const handleRemove = () => {
    if (!detail) return;
    removeMutation.mutate(detail.id, {
      onSuccess: () => {
        setConfirmingRemove(false);
        navigate({ to: "/store/staff" });
      },
    });
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
            {/* 基本情報（顔写真・名前・一言） */}
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
              {detail.headline ? (
                <div className="mt-1.5 text-token-sm text-muted">{detail.headline}</div>
              ) : (
                <div className="mt-1.5 text-token-sm text-muted-soft">
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

            {/* このスタッフを外す（在籍解除・控えめなボタン。実行は確認ダイアログを挟む） */}
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="mt-8 block w-full rounded-xl border-[1.5px] border-rose-spark py-4 text-center text-token-md font-bold text-rose"
            >
              {t("store.staffRemoveCta")}
            </button>
          </>
        )}
      </div>

      {/* 在籍解除の確認ダイアログ（お金は移動しない旨を明記） */}
      {confirmingRemove && detail && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-ink/40">
          <div className="w-full rounded-t-2xl bg-page px-6 pb-7 pt-6">
            <h2 className="text-token-lg font-bold text-ink">
              {t("store.staffRemoveConfirmTitle")}
            </h2>
            <p className="mt-3 text-token-sm leading-relaxed text-ink-sub">
              {t("store.staffRemoveConfirmBody", { name: detail.displayName })}
            </p>
            {removeMutation.isError && (
              <p className="mt-3 text-token-sm text-rose">{t("store.staffRemoveError")}</p>
            )}
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleRemove}
                disabled={removeMutation.isPending}
                className="rounded-xl bg-rose py-3.5 text-center text-token-md font-bold text-page disabled:opacity-60"
              >
                {removeMutation.isPending
                  ? t("store.staffRemoving")
                  : t("store.staffRemoveConfirmCta")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                disabled={removeMutation.isPending}
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
