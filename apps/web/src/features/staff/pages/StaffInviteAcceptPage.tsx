import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useInviteInfo } from "../hooks/useStaff.js";

// ログインを跨いでも招待コードを引き継ぐための保管キー（sessionStorage）
const PENDING_INVITE_KEY = "arigato.pendingInvite";

/**
 * 招待受け入れ画面（/invite/:code）。
 * 招待リンクからの流入口。GET /invites/:code で招待を検証し、所属先の店名を表示する。
 * 「はじめる」で、招待コードを引き継いで参加フロー（/staff/setup?invite=）へ繋ぐ。
 *   - 新規ユーザー → プロフィール作成 → 参加 → 参加完了「〇〇店に参加しました！」
 *   - 既存ユーザー → 作成をスキップして参加 → 参加完了（同店所属済みなら「既に所属」案内）
 * 未ログインのときはログインを挟むため、招待コードを sessionStorage にも退避して引き継ぐ。
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

  // 「はじめる」: 招待コードを引き継いで参加フローへ
  const handleStart = () => {
    if (isAuthenticated) {
      // ログイン済みは参加フロー（作成画面・既存はスキップして参加）へ直接進む。
      // ?invite= で引き継ぐため sessionStorage は使わず、残っていれば消しておく（再発火防止）。
      try {
        sessionStorage.removeItem(PENDING_INVITE_KEY);
      } catch {
        // 取り除けなくても致命的でない
      }
      navigate({ to: "/staff/setup", search: { invite: code } });
    } else {
      // 未ログインはログイン画面へ。ログインを跨いで引き継ぐため sessionStorage に退避する。
      // ログイン後に入口（/staff）が保留中の招待を拾って参加へ進む（拾った時点で消費・除去する）。
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, code);
      } catch {
        // ストレージが使えない環境ではログイン後に手動で招待リンクを開き直す
      }
      navigate({ to: "/staff/login" });
    }
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-7 pt-2">
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
        </div>
      </div>
    </PhoneFrame>
  );
}
