import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStaffBalance } from "../hooks/useStaff.js";

/**
 * 本人確認完了画面（/staff/identity/complete・モック07）。
 * Stripe Connect オンボーディングから戻ってきた先。完了の正は account.updated Webhook なので、
 * ここでは残高（identity_status / payable）をポーリングし、verified が反映されたら完了演出に切り替える。
 * まだ反映されていない場合は「確認中」を表示し、Webhook 反映を待つ。
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

  const balance = balanceQuery.data;
  // 本人確認が verified に反映されたか（Webhook 反映後に true になる）
  const verified = balance?.canPayout ?? false;

  // verified 反映を待つため、未確定のあいだは balance / me を定期的に取り直す。
  // Webhook 反映は数秒のことが多いため 3 秒間隔でポーリングする。
  useEffect(() => {
    if (!isAuthenticated || !meQuery.data || verified) return;
    const timer = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["staff", "balance"] });
      qc.invalidateQueries({ queryKey: ["staff", "me"] });
    }, 3000);
    return () => clearInterval(timer);
  }, [isAuthenticated, meQuery.data, verified, qc]);

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <CompleteLoading label={t("staff.loading")} />;
  }

  return (
    <PhoneFrame>
      {verified ? (
        // --- 完了演出（モック07） ---
        <div className="relative flex flex-1 flex-col overflow-hidden px-7 pb-8">
          {/* 紙吹雪（装飾。読み取りや操作に影響しない） */}
          <Confetti />

          {/* チェックマーク（pop アニメーション） */}
          <div className="mt-16 flex justify-center">
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

          <div className="mt-7 text-center text-token-4xl font-bold text-ink">
            {t("staff.identityCompleteTitle")}
          </div>

          {/* アクションはホームに戻るのみ（余計な情報・導線は出さない） */}
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
      ) : (
        // --- Webhook 反映待ち（確認中） ---
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {/* 確認中のスピナー風（ローズの淡いリング） */}
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-rose-soft border-t-rose motion-safe:animate-spin" />
          <div className="mt-7 text-token-xl font-bold text-ink">
            {t("staff.identityCompletePending")}
          </div>
          <div className="mt-3 text-token-md leading-relaxed text-ink-sub">
            {t("staff.identityCompletePendingNote")}
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: "/staff" })}
            className="mt-8 rounded-xl border-[1.5px] border-line bg-page px-8 py-3.5 text-center text-token-md font-semibold text-ink-label"
          >
            {t("staff.identityCompleteGoHome")}
          </button>
        </div>
      )}
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

/** 完了演出の紙吹雪（装飾のみ・上から落ちて回転する）。 */
function Confetti() {
  // 位置・色・形・遅延を変えた小片を散らす（トークン色のみ・モック07の落下モーション）
  const pieces = [
    { pos: "left-12 top-[120px]", color: "bg-rose-spark", round: false, delay: "[animation-delay:.1s]" },
    { pos: "left-28 top-[110px]", color: "bg-google-blue", round: false, delay: "[animation-delay:.2s]" },
    { pos: "left-48 top-[130px]", color: "bg-rose", round: true, delay: "[animation-delay:.15s]" },
    { pos: "right-20 top-[115px]", color: "bg-rose-spark", round: false, delay: "[animation-delay:.25s]" },
    { pos: "right-10 top-[135px]", color: "bg-google-blue", round: true, delay: "[animation-delay:.12s]" },
    { pos: "left-20 top-[160px]", color: "bg-rose", round: false, delay: "[animation-delay:.3s]" },
    { pos: "right-28 top-[165px]", color: "bg-rose-spark", round: true, delay: "[animation-delay:.22s]" },
  ];
  return (
    <>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`pointer-events-none absolute h-2 w-2 motion-safe:animate-fall ${
            p.round ? "rounded-full" : "rounded-[2px]"
          } ${p.pos} ${p.color} ${p.delay}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
