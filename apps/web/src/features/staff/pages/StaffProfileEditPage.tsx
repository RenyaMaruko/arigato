import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useUpdateStaffProfile } from "../hooks/useStaff.js";

/**
 * プロフィール編集画面（/staff/profile）。
 * 表示名・一言を編集して PATCH /staff/me で保存する（所属店・招待は変更しない）。
 * 本人スコープ（自分の staff のみ）で、保存後はホームへ戻る。
 * 本実装は表示名・一言の編集まで（アバターアップロードは Sprint 5 に委ねる）。
 */
export function StaffProfileEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ログイン状態と自分のプロフィールを取得
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);
  const updateMutation = useUpdateStaffProfile();

  // 未ログイン・未作成なら入口へ戻す。リダイレクトは副作用で行う（描画中の setState を避ける）
  const me = meQuery.data;
  const shouldRedirect = !authLoading && !meQuery.isLoading && (!isAuthenticated || !me);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // 取得中・リダイレクト待ちはローディング
  if (authLoading || (isAuthenticated && meQuery.isLoading) || !me) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("staff.loading")}
        </div>
      </PhoneFrame>
    );
  }

  return <EditForm me={me} updateMutation={updateMutation} />;
}

/**
 * 編集フォーム本体。
 * 取得済みプロフィールを初期値にして入力状態を持ち、保存で PATCH を呼ぶ。
 */
function EditForm({
  me,
  updateMutation,
}: {
  me: { displayName: string; headline: string | null; avatarUrl: string | null };
  updateMutation: ReturnType<typeof useUpdateStaffProfile>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // 入力状態（取得済みの値で初期化）
  const [displayName, setDisplayName] = useState<string>(me.displayName);
  const [headline, setHeadline] = useState<string>(me.headline ?? "");
  const [error, setError] = useState<string | null>(null);

  // 保存可能か（表示名が必須）
  const canSubmit = displayName.trim() !== "" && !updateMutation.isPending;

  // 保存を実行する
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    updateMutation.mutate(
      {
        displayName: displayName.trim(),
        headline: headline.trim() === "" ? undefined : headline.trim(),
      },
      {
        onSuccess: () => {
          // 保存できたらホームへ戻る
          navigate({ to: "/staff" });
        },
        onError: () => {
          setError(t("staff.editError"));
        },
      },
    );
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center gap-3.5 px-[22px] pb-3.5 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
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
          >
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.editTitle")}</span>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[26px] pb-7 pt-2">
        {/* アバター（編集 UI は Sprint 5。現状は表示のみ）。ローズの淡いリングで包む */}
        <div className="mt-2 flex justify-center">
          <div className="rounded-full bg-rose-soft p-1">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-stamp-bg text-token-sm text-muted ring-2 ring-page">
              {me.avatarUrl ? (
                <img
                  src={me.avatarUrl}
                  alt={me.displayName}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                "顔写真"
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col">
          {/* 表示名 */}
          <label className="text-token-sm text-ink-sub" htmlFor="edit-display-name">
            {t("staff.displayNameLabel")}
          </label>
          <input
            id="edit-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("staff.displayNamePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 一言（任意） */}
          <label className="mt-[18px] text-token-sm text-ink-sub" htmlFor="edit-headline">
            {t("staff.headlineLabel")}
          </label>
          <input
            id="edit-headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder={t("staff.headlinePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 所属店は複数（掛け持ち）になりうるため、編集画面では一覧をホームに任せる
              （プロフィールは人ごと1つ・全所属店で共通のため、ここでは表示名・一言のみ編集する） */}

          {/* 保存ボタン */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-[34px] rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-50"
          >
            {updateMutation.isPending ? t("staff.loading") : t("staff.editSubmit")}
          </button>
          {error && <div className="mt-3 text-center text-token-sm text-rose">{error}</div>}
        </form>
      </div>

      {/* 下部ボトムナビ（プロフィール編集はタブに該当しないため active 未指定） */}
      <StaffBottomNav />
    </PhoneFrame>
  );
}
