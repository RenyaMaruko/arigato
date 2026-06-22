import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useInviteInfo } from "../hooks/useStaff.js";

/**
 * 招待受け入れ画面（/invite/:code）。
 * 招待リンクからの流入口。GET /invites/:code で招待を検証し、所属先の店名を表示する。
 * 「はじめる」で、ログイン済みならプロフィール作成、未ログインならログインへ繋ぐ。
 * いずれも招待コードを ?invite= に載せて引き継ぎ、所属（store_id）を確定させる。
 */
export function StaffInviteAcceptPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL パラメータから招待コードを取得
  const { code } = useParams({ from: "/invite/$code" });
  // ログイン状態（遷移先の出し分けに使う）
  const { isAuthenticated } = useAuthSession();
  // 招待検証
  const inviteQuery = useInviteInfo(code);

  // 「はじめる」: 招待コードを引き継いで、ログイン or プロフィール作成へ
  const handleStart = () => {
    if (isAuthenticated) {
      // ログイン済みは作成画面へ（招待コードを ?invite= で渡す）
      navigate({ to: "/staff/setup", search: { invite: code } });
    } else {
      // 未ログインはログイン画面へ（ログイン後に作成へ進む）
      navigate({ to: "/staff" });
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-7 pt-2">
        {/* 見出し */}
        <div className="mt-10 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("staff.inviteTitle")}</div>
          <div className="mt-2 text-token-md text-ink-sub">{t("staff.inviteLead")}</div>
        </div>

        {/* 招待検証の結果 */}
        <div className="mt-10">
          {/* 検証中 */}
          {inviteQuery.isLoading && (
            <div className="rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md text-ink-sub">
              {t("staff.inviteChecking")}
            </div>
          )}

          {/* 有効な招待: 所属先の店名を表示 */}
          {inviteQuery.data && inviteQuery.data.valid && (
            <div className="rounded-xl border-[1.5px] border-rose bg-rose-soft px-5 py-7 text-center">
              <div className="text-token-sm text-ink-sub">{t("staff.inviteStoreLabel")}</div>
              <div className="mt-2 text-token-3xl font-bold text-ink">
                {inviteQuery.data.storeName}
              </div>
              <div className="mt-2 text-token-md text-rose">{t("staff.inviteValid")}</div>
            </div>
          )}

          {/* 無効な招待（使用済み・失効・店未承認） */}
          {inviteQuery.data && !inviteQuery.data.valid && (
            <div className="rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md text-ink-sub">
              {t("staff.inviteInvalid")}
            </div>
          )}

          {/* 招待が見つからない（404） */}
          {inviteQuery.data === null && !inviteQuery.isLoading && (
            <div className="rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md text-ink-sub">
              {t("staff.inviteNotFound")}
            </div>
          )}

          {/* 通信エラー */}
          {inviteQuery.isError && (
            <div className="rounded-xl border-[1.5px] border-line bg-surface-subtle px-5 py-6 text-center text-token-md text-ink-sub">
              {t("staff.inviteCheckError")}
            </div>
          )}
        </div>

        {/* 「はじめる」: 有効な招待のときだけ進める */}
        <div className="mt-auto pt-8">
          <button
            type="button"
            onClick={handleStart}
            disabled={!inviteQuery.data?.valid}
            className="w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-50"
          >
            {t("staff.inviteStart")}
          </button>
          <div className="mt-3 text-center text-token-xs text-muted">{t("staff.createNote")}</div>
        </div>
      </div>
    </PhoneFrame>
  );
}
