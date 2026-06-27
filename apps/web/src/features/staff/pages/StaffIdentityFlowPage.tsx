import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStartConnectOnboard } from "../hooks/useStaff.js";

/**
 * 本人確認・口座登録の流れ画面（/staff/identity・モック06）。
 * 4ステップ（基本情報→本人確認書類→口座情報→審査）を案内し、
 * 「手続きをはじめる」で Stripe Connect オンボーディングリンクを発行して遷移する。
 * 完了の判定はこのリンクの戻りではなく account.updated Webhook を正とする。
 */
export function StaffIdentityFlowPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuthSession();

  // 戻る: 来た元（ホーム/残高など）へ履歴で戻す。履歴が無い（直リンク）ときはホームへ。
  // 以前は /staff/balance に固定していたため、ホームの「本人確認をする」から来ても残高画面に
  // 飛んでしまっていた。実際の遷移元へ戻すことで自然な挙動にする。
  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      navigate({ to: "/staff" });
    }
  };
  const meQuery = useStaffMe(isAuthenticated);
  const onboard = useStartConnectOnboard();

  // 未ログイン・未作成なら入口へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <IdentityLoading label={t("staff.loading")} />;
  }

  // オンボーディングリンクを発行して Stripe のホスト画面へ遷移する
  const handleStart = () => {
    onboard.mutate(undefined, {
      onSuccess: (res) => {
        // Stripe のオンボーディングへ遷移（本人確認・口座登録は Stripe が収集する）
        window.location.href = res.onboardingUrl;
      },
    });
  };

  // 4ステップの定義（モック06に対応）
  const steps = [
    { title: t("staff.identityStep1Title"), sub: t("staff.identityStep1Sub"), icon: <UserIcon /> },
    { title: t("staff.identityStep2Title"), sub: t("staff.identityStep2Sub"), icon: <IdIcon /> },
    { title: t("staff.identityStep3Title"), sub: t("staff.identityStep3Sub"), icon: <BankIcon /> },
    {
      title: t("staff.identityStep4Title"),
      sub: t("staff.identityStep4Sub"),
      icon: <SearchIcon />,
    },
  ];

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center gap-3.5 px-[22px] pb-[18px] pt-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.identityTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[26px] pb-6 pt-3.5">
        {/* ステップのタイムライン */}
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-soft text-rose">
                  {step.icon}
                </span>
                {/* 最後以外はステップ間をつなぐ縦線 */}
                {index < steps.length - 1 && (
                  <span className="my-1.5 w-0.5 flex-1 bg-rose-spark/40" />
                )}
              </div>
              <div className={index < steps.length - 1 ? "pb-6" : ""}>
                <div className="text-token-lg font-bold text-ink">{step.title}</div>
                <div className="mt-1 text-token-base text-ink-sub">{step.sub}</div>
              </div>
            </li>
          ))}
        </ol>

        {/* エラー表示 */}
        {onboard.isError && (
          <div className="mt-6 rounded-xl border border-rose-spark/60 bg-rose-soft px-4 py-3 text-center text-token-sm text-rose">
            {t("staff.identityError")}
          </div>
        )}

        {/* 手続き開始ボタン（オンボーディングリンク発行→遷移） */}
        <button
          type="button"
          onClick={handleStart}
          disabled={onboard.isPending}
          className="mt-8 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
        >
          {onboard.isPending ? t("staff.identityStarting") : t("staff.identityStart")}
        </button>
      </div>

      {/* 下部ボトムナビ（本人確認フローはタブに該当しないため active 未指定） */}
      <StaffBottomNav />
    </PhoneFrame>
  );
}

/** 本人確認の流れ画面のローディング表示。 */
function IdentityLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}

/** 戻る矢印アイコン。 */
function BackIcon() {
  return (
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
  );
}

/** 利用者アイコン（基本情報）。 */
function UserIcon() {
  return (
    <svg
      width="22"
      height="22"
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
  );
}

/** 本人確認書類アイコン。 */
function IdIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M14 9h4M14 13h4M5.5 16c.8-1.6 2-2.2 3.5-2.2s2.7.6 3.5 2.2" />
    </svg>
  );
}

/** 銀行（口座情報）アイコン。 */
function BankIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9.5 12 4l9 5.5" />
      <path d="M5 10v8M9 10v8M15 10v8M19 10v8" />
      <path d="M3 21h18" />
    </svg>
  );
}

/** 審査（虫眼鏡）アイコン。 */
function SearchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}
