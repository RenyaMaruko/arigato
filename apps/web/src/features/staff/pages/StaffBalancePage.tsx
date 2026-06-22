import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStaffBalance } from "../hooks/useStaff.js";

/**
 * 残高・ステータス画面（/staff/balance・モック05）。
 * 保留残高（held 合計）と着金可能額（payable 合計）を本人に表示する（金額は本人のみ）。
 * 本人確認前は「口座を登録する」導線を出し、本人確認の流れ（オンボーディング）へ進めるようにする。
 */
export function StaffBalancePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <BalanceLoading label={t("staff.loading")} />;
  }

  const balance = balanceQuery.data;
  const heldAmount = balance?.heldAmount ?? 0;
  const payableAmount = balance?.payableAmount ?? 0;
  // 本人確認済み（着金可能）かどうかで導線を出し分ける
  const verified = balance?.canPayout ?? false;

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center justify-between bg-page px-[22px] pb-3.5 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.balanceTitle")}</span>
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[22px] pb-6 pt-5">
        {balanceQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
            {t("staff.loading")}
          </div>
        ) : (
          <>
            {/* 保留残高（held 合計・本人のみ） */}
            <section className="rounded-[18px] border border-rose-spark/60 bg-rose-soft px-[22px] py-[22px]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-token-md font-bold text-rose">
                    {t("staff.balanceHeldLabel")}
                  </div>
                  <div className="mt-0.5 text-token-sm text-rose/70">
                    {t("staff.balanceHeldSub")}
                  </div>
                </div>
                <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-rose-spark/40 text-rose">
                  <ClockIcon />
                </span>
              </div>
              <div className="mt-3.5 text-[34px] font-bold leading-none text-ink">
                ¥{heldAmount.toLocaleString()}
              </div>
              {!verified && (
                <div className="mt-2.5 text-token-sm text-rose/80">
                  {t("staff.balanceHeldNote")}
                </div>
              )}
            </section>

            {/* 着金可能額（payable 合計・本人のみ） */}
            <section className="mt-4 rounded-[18px] border border-line-soft bg-page px-[22px] py-[22px]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-token-md font-bold text-ink">
                    {t("staff.balancePayableLabel")}
                  </div>
                  <div className="mt-0.5 text-token-sm text-muted-soft">
                    {t("staff.balancePayableSub")}
                  </div>
                </div>
                <span className="text-muted-soft">
                  <BankIcon />
                </span>
              </div>
              <div className="mt-3.5 text-[30px] font-bold leading-none text-ink">
                ¥{payableAmount.toLocaleString()}
              </div>
            </section>

            {/* 導線: 本人確認前は口座登録、完了後は補足を表示する */}
            {verified ? (
              <div className="mt-6 rounded-xl border border-line bg-surface-subtle px-4 py-4 text-center text-token-sm text-ink-sub">
                {t("staff.balanceVerifiedNote")}
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/staff/identity" })}
                  className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
                >
                  {t("staff.balanceRegisterAccount")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/staff/identity" })}
                  className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-md font-semibold text-ink-label"
                >
                  {t("staff.balanceSeeFlow")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/** 残高画面のローディング表示。 */
function BalanceLoading({ label }: { label: string }) {
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

/** 時計アイコン（保留＝時間で着金可能になる、の含意）。 */
function ClockIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** 銀行（着金口座）アイコン。 */
function BankIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
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
