import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useInviteInfo, useCreateStaffProfile } from "../hooks/useStaff.js";

/**
 * 初回プロフィール作成画面（/staff/setup）。
 * 招待コード（?invite= から自動入力 or 手入力）で所属先を確定し、表示名・一言を入力して作成する。
 * 本人確認・口座登録・Stripe Connect 連携は一切求めない（体験を登録の前に）。
 * 作成成功でホーム（/staff）へ遷移する。
 */
export function StaffProfileCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ?invite= で招待コードを受け取る（招待リンクからの流入）。どのルート配下でも読めるよう strict:false で受ける
  const search = useSearch({ strict: false }) as { invite?: string };
  const invite = search.invite;

  // 入力状態（UI ローカル・文字列で型付け）
  const [inviteCode, setInviteCode] = useState<string>(invite ?? "");
  const [displayName, setDisplayName] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // 招待リンクからのコードが後から届いたら反映する
  useEffect(() => {
    if (invite && invite !== inviteCode) {
      setInviteCode(invite);
    }
    // 初回流入時のみ同期（手入力を上書きしない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  // 招待検証（コードがあれば店名・有効性を取得）
  const inviteQuery = useInviteInfo(inviteCode);
  // プロフィール作成
  const createMutation = useCreateStaffProfile();

  // 作成可能か（招待が有効で表示名が入っているか）
  const inviteValid = inviteQuery.data?.valid === true;
  const canSubmit =
    inviteValid && displayName.trim() !== "" && !createMutation.isPending;

  // 作成を実行する
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    createMutation.mutate(
      {
        inviteCode: inviteCode.trim(),
        displayName: displayName.trim(),
        headline: headline.trim() === "" ? undefined : headline.trim(),
      },
      {
        onSuccess: () => {
          // 作成できたらホームへ
          navigate({ to: "/staff" });
        },
        onError: (err) => {
          // バックの error コードを文言に対応づける
          const code = err instanceof Error ? err.message : "";
          if (code === "invite_not_usable") setError(t("staff.createErrorInvite"));
          else if (code === "staff_already_exists") setError(t("staff.createErrorExists"));
          else setError(t("staff.createErrorGeneric"));
        },
      },
    );
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-6">
          <div className="text-token-3xl font-bold text-ink">{t("staff.createTitle")}</div>
          <div className="mt-2 text-token-md text-ink-sub">{t("staff.createLead")}</div>
        </div>

        <form onSubmit={handleSubmit} className="mt-7 flex flex-col">
          {/* 招待コード */}
          <label className="text-token-sm text-ink-sub" htmlFor="invite-code">
            {t("staff.inviteCodeLabel")}
          </label>
          <input
            id="invite-code"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder={t("staff.inviteCodePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />
          {/* 招待検証の結果表示 */}
          {inviteCode.trim() !== "" && (
            <div className="mt-2 text-token-sm">
              {inviteQuery.isLoading && (
                <span className="text-muted">{t("staff.inviteChecking")}</span>
              )}
              {inviteQuery.data && inviteQuery.data.valid && (
                <span className="text-rose">
                  「{inviteQuery.data.storeName}」{t("staff.inviteValid")}
                </span>
              )}
              {inviteQuery.data && !inviteQuery.data.valid && (
                <span className="text-muted">{t("staff.inviteInvalid")}</span>
              )}
              {inviteQuery.data === null && !inviteQuery.isLoading && (
                <span className="text-muted">{t("staff.inviteNotFound")}</span>
              )}
            </div>
          )}

          {/* 表示名 */}
          <label className="mt-5 text-token-sm text-ink-sub" htmlFor="display-name">
            {t("staff.displayNameLabel")}
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("staff.displayNamePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 一言（任意） */}
          <label className="mt-5 text-token-sm text-ink-sub" htmlFor="headline">
            {t("staff.headlineLabel")}
          </label>
          <input
            id="headline"
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder={t("staff.headlinePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 作成ボタン */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-8 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-50"
          >
            {t("staff.createSubmit")}
          </button>
          {/* 本人確認は後でよい旨 */}
          <div className="mt-3 text-center text-token-xs text-muted">{t("staff.createNote")}</div>
          {error && <div className="mt-3 text-center text-token-sm text-rose">{error}</div>}
        </form>
      </div>
    </PhoneFrame>
  );
}
