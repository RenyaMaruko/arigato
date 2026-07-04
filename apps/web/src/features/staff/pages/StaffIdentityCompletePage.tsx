import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStaffBalance } from "../hooks/useStaff.js";

// 申請（提出）の反映待ちのタイムアウト（ミリ秒）。提出のWebhookは通常数秒で届くが遅れることもあるため、
// 長めに待つ。これを過ぎても none のままなら「まだ提出されていない（途中離脱）」可能性が高い。
// タイムアウト後も裏の確認は続けており、届き次第「申請完了」へ自動で切り替わる。
const APPLY_TIMEOUT_MS = 60000;

/**
 * 本人確認の申請完了画面（/staff/identity/complete）。
 * 埋め込みオンボーディングを抜けて戻ってきた先。
 * 「提出された」ことの確定は account.updated Webhook（identity_status が none → pending/verified）なので、
 * 反映されるまでは申請中のロード表示を出し、反映されたら「申請が完了しました」（審査1〜2営業日）に切り替える。
 * こうするとホームへ戻った時点で必ず「ただいま申請中」以降の表示になり、古い「本人確認をする」に戻らない。
 * 長く none のまま（＝途中離脱で未提出の可能性）はタイムアウト案内を出す。
 */
export function StaffIdentityCompletePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);
  const balanceQuery = useStaffBalance(isAuthenticated && Boolean(meQuery.data));

  // 未ログイン・未作成なら入口へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // 提出が反映されたか（none → pending/verified/action_required になったら「申請完了」を出せる）。
  // action_required（要対応）も提出自体は済んでいるため申請完了として扱う（対応の案内はホームで出す）
  const identityStatus = balanceQuery.data?.identityStatus ?? null;
  const applied =
    identityStatus === "pending" ||
    identityStatus === "verified" ||
    identityStatus === "action_required";

  // 反映待ちが長引いたか（未提出の可能性の案内に切り替える）
  const [timedOut, setTimedOut] = useState(false);

  // 提出のWebhook反映を待つあいだ、残高（identity_status 込み）を数秒おきに取り直す
  useEffect(() => {
    if (!isAuthenticated || !meQuery.data || applied) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["staff", "balance"] });
    }, 2500);
    const timeout = setTimeout(() => setTimedOut(true), APPLY_TIMEOUT_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isAuthenticated, meQuery.data, applied, qc]);

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <CompleteLoading label={t("staff.loading")} />;
  }

  return (
    <PhoneFrame>
      {applied ? (
        // --- 申請完了（提出がWebhookで反映された）。審査期間の案内を添える ---
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-7 pb-8 pt-2">
          {/* チェックマーク（pop アニメーション）。申請の受け付け完了を示す */}
          <div className="mt-20 flex justify-center">
            <div className="flex h-[104px] w-[104px] animate-pop items-center justify-center rounded-full bg-rose text-page">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            </div>
          </div>

          {/* 申請完了のタイトル＋審査期間の案内 */}
          <div className="mt-7 text-center text-token-2xl font-bold leading-[1.6] text-ink">
            {t("staff.identityAppliedTitle")}
          </div>
          <div className="mt-3 whitespace-pre-line text-center text-token-md leading-relaxed text-ink-sub">
            {t("staff.identityAppliedNote")}
          </div>

          {/* アクションはホームに戻るのみ */}
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <button
              type="button"
              onClick={() => navigate({ to: "/staff" })}
              className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
            >
              {t("staff.identityCompleteGoHome")}
            </button>
          </div>
        </div>
      ) : timedOut ? (
        // --- 反映されないまま時間切れ（途中離脱で未提出の可能性）。再開の案内を出す ---
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="text-token-xl font-bold text-ink">
            {t("staff.identityApplyTimeoutTitle")}
          </div>
          <div className="mt-3 text-token-md leading-relaxed text-ink-sub">
            {t("staff.identityApplyTimeoutNote")}
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff/identity" })}
            className="mt-8 w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
          >
            {t("staff.identityApplyTimeoutResume")}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff" })}
            className="mt-3 rounded-xl border-[1.5px] border-line bg-page px-8 py-3.5 text-center text-token-md font-semibold text-ink-label"
          >
            {t("staff.identityCompleteGoHome")}
          </button>
        </div>
      ) : (
        // --- 申請中（提出のWebhook反映待ち）。数秒で申請完了表示に切り替わる ---
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {/* 申請中のスピナー（ローズの淡いリング） */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-rose-soft border-t-rose motion-safe:animate-spin" />
          <div className="mt-7 text-token-xl font-bold text-ink">
            {t("staff.identityApplying")}
          </div>
          <div className="mt-3 text-token-md leading-relaxed text-ink-sub">
            {t("staff.identityApplyingNote")}
          </div>
        </div>
      )}

      {/* 下部ボトムナビ（本人確認完了はタブに該当しないため active 未指定） */}
      <StaffBottomNav />
    </PhoneFrame>
  );
}

/** 本人確認完了画面のローディング表示。 */
function CompleteLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}
