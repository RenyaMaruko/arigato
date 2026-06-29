import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useUpdateStaffProfile, useUploadStaffAvatar } from "../hooks/useStaff.js";

/**
 * プロフィール編集画面（/staff/profile）。
 * 表示名・一言を編集して PATCH /staff/me で保存する（所属店・招待は変更しない）。
 * 本人スコープ（自分の staff のみ）で、保存後はホームへ戻る。
 * アバターは顔写真枠をタップ → 画像選択 → アップロード → プレビュー更新で差し替える。
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
 * アバターは顔写真枠タップで画像選択 → アップロードし、成功で avatarUrl を反映する。
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
  // アバターアップロード（POST /staff/me/avatar）
  const avatarMutation = useUploadStaffAvatar();
  // 隠しファイル入力への参照（顔写真枠タップで開く）
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 直近にアップロードした公開URL（取り直し前の即時プレビュー用）
  const [avatarPreview, setAvatarPreview] = useState<string | null>(me.avatarUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // 入力状態（取得済みの値で初期化）
  const [displayName, setDisplayName] = useState<string>(me.displayName);
  const [headline, setHeadline] = useState<string>(me.headline ?? "");
  const [error, setError] = useState<string | null>(null);

  // ファイル選択時にアップロードする。クライアント側でも MIME・サイズを事前チェックする（無駄送信を防ぐ）。
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを連続選択しても change が発火するよう入力をリセットする
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    // 事前チェック（許可 MIME か・サイズ上限内か）。違反はアップロードせず文言を出す。
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      setAvatarError(t("staff.avatarInvalidType"));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setAvatarError(t("staff.avatarTooLarge"));
      return;
    }
    avatarMutation.mutate(file, {
      onSuccess: (result) => {
        // 成功で即プレビューを差し替える（staff/me の再取得も走る）
        setAvatarPreview(result.avatarUrl);
      },
      onError: () => {
        setAvatarError(t("staff.avatarError"));
      },
    });
  };

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

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-[26px] pb-7 pt-2">
        {/* アバター。顔写真枠をタップすると画像を選んでアップロードし、プレビューを差し替える。 */}
        <div className="mt-2 flex flex-col items-center">
          {/* 隠しファイル入力（画像のみ）。枠タップで開く */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
            onChange={handleAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarMutation.isPending}
            aria-label={t("staff.avatarChange")}
            className="relative rounded-full bg-rose-soft p-1 disabled:opacity-60"
          >
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-stamp-bg text-muted ring-2 ring-page">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt={me.displayName}
                  className="h-24 w-24 rounded-full object-cover"
                />
              ) : (
                // 未設定は中立な人物アイコン（「顔写真」必須に見えないように）
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
                </svg>
              )}
            </div>
            {/* カメラバッジ（白縁のローズ丸）。タップで画像選択を示す装飾 */}
            <span
              className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-[2.5px] border-page bg-rose text-page"
              aria-hidden="true"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5a2 2 0 0 1 2-2h2l1.2-1.8h7.6L19 6.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
            </span>
          </button>
          {/* アップロード中・失敗の表示 */}
          {avatarMutation.isPending && (
            <div className="mt-2 text-token-sm text-ink-sub">{t("staff.avatarUploading")}</div>
          )}
          {avatarError && (
            <div className="mt-2 text-center text-token-sm text-rose">{avatarError}</div>
          )}
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
