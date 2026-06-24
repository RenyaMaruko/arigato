import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { MIN_PAYOUT_AMOUNT } from "@arigato/shared";
import type { PayoutItem, PayoutStatus } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import {
  useStaffMe,
  useStaffBalance,
  useStaffPayouts,
  useCreatePayout,
} from "../hooks/useStaff.js";

/**
 * 送金（振込申請）画面（/staff/payout）。
 * 手動送金（メルカリ型）。着金可能額（payable な投げ銭の手取り合計）を大きく見せ、
 * 「送金する」で全額を登録口座へ送金申請する（確認シートを挟んでから実行する）。
 *
 * 出し分け（残高API の canPayout / identityStatus を正とする）:
 *  - verified でない → 本人確認・口座登録が必要。残高画面/本人確認（/staff/identity）へ誘導（流用）。
 *  - 着金可能額が最低送金額（¥100）未満／残高0 → 送金ボタンを無効化＋理由表示。
 *  - それ以外 → 全額送金できる。
 * 着金は申請から数営業日（画面に明示）。送金履歴（GET /staff/me/payouts）を新しい順に並べる。
 * 金額表示はこの本人画面のみ（横断ルール: 金額は本人のみ。店向け経路には出さない）。
 */
export function StaffPayoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);
  const enabled = isAuthenticated && Boolean(meQuery.data);
  const balanceQuery = useStaffBalance(enabled);
  const payoutsQuery = useStaffPayouts(enabled);
  const createPayout = useCreatePayout();

  // 確認シートの開閉（UI 状態のみ。Zustand を使うほどではないためローカル state）
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 送金後の完了表示（送金額を控えて「¥◯◯を送金しました」を出す）
  const [doneAmount, setDoneAmount] = useState<number | null>(null);
  // 送金時のエラーコード（API の error コード。null は未エラー）
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // 未ログイン・未作成なら入口へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <PayoutLoading label={t("staff.loading")} />;
  }

  const balance = balanceQuery.data;
  // 着金可能額（payable 合計＝送金できる全額・手取り）
  const payableAmount = balance?.payableAmount ?? 0;
  // 本人確認済み（着金可能）かどうか。残高API の canPayout を正とする
  const verified = balance?.canPayout ?? false;
  // 最低送金額に満たない／残高0 のとき送金不可
  const belowMinimum = payableAmount < MIN_PAYOUT_AMOUNT;
  // 送金できるか（verified かつ最低送金額以上）。送金中は二重送信を防ぐ
  const canSend = verified && !belowMinimum && !createPayout.isPending;

  const payouts = payoutsQuery.data?.items ?? [];

  // 送金を確定する（確認シートで「送金する」を押したとき）
  const handleConfirm = () => {
    setErrorCode(null);
    createPayout.mutate(undefined, {
      onSuccess: (result) => {
        // 完了表示用に送金額を控える。確認シートは閉じる
        setDoneAmount(result.amount);
        setConfirmOpen(false);
      },
      onError: (err) => {
        // バックの error コードを保持（最低額不足・本人確認未完了など）。シートは閉じて画面上に出す
        setErrorCode(err instanceof Error ? err.message : "payout_error");
        setConfirmOpen(false);
      },
    });
  };

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
        <span className="text-token-2xl font-bold text-ink">{t("staff.payoutTitle")}</span>
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-[22px] pb-6 pt-5">
        {balanceQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
            {t("staff.loading")}
          </div>
        ) : (
          <>
            {/* 着金可能額（送金できる全額・手取り）を主役に大きくローズで見せる。
                残高モック（05/01）の保留残高カードのトーン（淡ローズ面＋ローズ濃の数字＋丸アイコン）に寄せる。 */}
            <section className="rounded-[18px] border border-rose-spark/50 bg-rose-soft px-[22px] py-[22px]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-token-md font-bold text-rose">
                    {t("staff.payoutAvailableLabel")}
                  </div>
                  <div className="mt-0.5 text-token-sm text-rose/60">
                    {t("staff.payoutAvailableSub")}
                  </div>
                </div>
                {/* ローズ淡色の丸に銀行アイコン（着金口座のしるし） */}
                <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-rose-spark/40 text-rose">
                  <BankIcon />
                </span>
              </div>
              {/* 手取り全額をローズで大きく（このページの主役） */}
              <div className="mt-3.5 text-[34px] font-bold leading-none text-rose">
                ¥{payableAmount.toLocaleString()}
              </div>
              {/* 着金タイミングを明示（数営業日） */}
              <div className="mt-3 text-token-xs leading-relaxed text-rose/70">
                {t("staff.payoutArrivalNote")}
              </div>
            </section>

            {/* 送金エラー（最低額不足・本人確認未完了など）。API の error コードで案内を出し分ける */}
            {errorCode && (
              <div className="mt-4 rounded-xl border border-rose-spark/60 bg-rose-soft px-4 py-3 text-token-sm leading-relaxed text-rose">
                {errorCode === "payout_not_verified"
                  ? t("staff.payoutErrorNotVerified")
                  : errorCode === "payout_below_minimum"
                    ? t("staff.payoutErrorBelowMinimum")
                    : t("staff.payoutError")}
              </div>
            )}

            {/* 送金完了の表示（送金額の控えから「¥◯◯を送金しました」） */}
            {doneAmount != null && (
              <div className="mt-4 rounded-xl border border-line bg-surface-subtle px-4 py-3 text-center text-token-sm leading-relaxed text-ink-sub">
                {t("staff.payoutDone", { amount: `¥${doneAmount.toLocaleString()}` })}
              </div>
            )}

            {/* 導線: verified でなければ本人確認・口座登録へ誘導（既存の本人確認画面を流用）。
                verified でも残高0/最低額未満なら無効化＋理由。それ以外は送金ボタン。 */}
            {!verified ? (
              <div className="mt-6 flex flex-col gap-3">
                {/* 本人確認・口座登録が必要な案内（淡ローズ面＋丸アイコンで「要対応」を分かりやすく） */}
                <div className="flex items-start gap-3 rounded-xl border border-rose-spark/50 bg-rose-soft px-4 py-4">
                  <span className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-rose-spark/40 text-rose">
                    <ShieldIcon />
                  </span>
                  <p className="text-token-sm leading-relaxed text-rose/90">
                    {t("staff.payoutNeedVerify")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/staff/identity" })}
                  className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
                >
                  {t("staff.payoutGoVerify")}
                </button>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => setConfirmOpen(true)}
                  className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:bg-rose-spark/50 disabled:text-page"
                >
                  {t("staff.payoutCta")}
                </button>
                {/* 送金できない理由（残高0/最低額未満）を控えめに添える */}
                {belowMinimum && (
                  <p className="px-1 text-center text-token-xs leading-relaxed text-muted">
                    {payableAmount === 0
                      ? t("staff.payoutNoBalance")
                      : t("staff.payoutBelowMinimum", {
                          min: `¥${MIN_PAYOUT_AMOUNT.toLocaleString()}`,
                        })}
                  </p>
                )}
              </div>
            )}

            {/* 送金履歴（いつ・いくら・状態）。新しい順 */}
            <section className="mt-9">
              <div className="text-token-base font-bold text-ink-label">
                {t("staff.payoutHistoryTitle")}
              </div>
              {payoutsQuery.isLoading ? (
                <div className="mt-3 text-token-sm text-ink-sub">{t("staff.loading")}</div>
              ) : payouts.length === 0 ? (
                <div className="mt-3 rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-5 text-center text-token-sm leading-relaxed text-ink-sub">
                  {t("staff.payoutHistoryEmpty")}
                </div>
              ) : (
                <div className="mt-3 overflow-hidden rounded-xl border-[1.5px] border-line bg-page">
                  {payouts.map((p, i) => (
                    <PayoutRow key={p.id} item={p} showDivider={i > 0} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* 送金確認シート（下からせり上がる。スクリムタップ・キャンセルで閉じる） */}
      {confirmOpen && (
        <div className="absolute inset-0 z-10">
          {/* 背面スクリム（タップで閉じる） */}
          <button
            type="button"
            aria-label={t("staff.payoutCancel")}
            onClick={() => setConfirmOpen(false)}
            className="absolute inset-0 animate-scrim-in bg-scrim"
          />
          {/* シート本体 */}
          <div className="absolute inset-x-0 bottom-0 animate-sheet-up rounded-t-2xl bg-page px-6 pb-[34px] pt-3.5 shadow-sheet">
            {/* ドラッグハンドル */}
            <div className="mb-4 flex justify-center">
              <span className="h-1 w-[38px] rounded-pill bg-handle" />
            </div>
            {/* 送金先（口座）のしるしをローズ淡色の丸で添える */}
            <div className="mb-3.5 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-soft text-rose">
                <BankIcon />
              </span>
            </div>
            <div className="text-center text-token-xl font-bold text-ink">
              {t("staff.payoutConfirmTitle")}
            </div>
            {/* 送金する金額をローズで強調して見せる */}
            <div className="mt-2 text-center text-token-4xl font-bold leading-none text-rose">
              ¥{payableAmount.toLocaleString()}
            </div>
            {/* 着金タイミングを明示してから実行する */}
            <p className="mt-3 text-center text-token-md leading-relaxed text-ink-sub">
              {t("staff.payoutConfirmBody", {
                amount: `¥${payableAmount.toLocaleString()}`,
              })}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={createPayout.isPending}
                onClick={handleConfirm}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:bg-rose-spark/50"
              >
                {createPayout.isPending ? t("staff.payoutSending") : t("staff.payoutConfirmCta")}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-xl border-[1.5px] border-line bg-page py-4 text-center text-token-md font-semibold text-ink-label"
              >
                {t("staff.payoutCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

/**
 * 送金履歴の1行（申請日・金額・状態）。
 * 状態は申請中（pending）/ 着金済（paid）/ 失敗（failed）をバッジで色分けする。
 */
function PayoutRow({ item, showDivider }: { item: PayoutItem; showDivider: boolean }) {
  const { t } = useTranslation();
  // 申請日時を「M/D」へ整形（日本語表示）
  const date = new Date(item.createdAt);
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${showDivider ? "border-t border-line-soft" : ""}`}
    >
      {/* 送金のしるし（ローズ淡色の丸＋上向き矢印＝口座へ送金） */}
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-rose">
        <PayoutMarkIcon />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-token-md font-bold text-ink">
          ¥{item.amount.toLocaleString()}
        </span>
        <span className="text-token-xs text-muted">{dateLabel}</span>
      </div>
      <PayoutStatusBadge status={item.status} label={t(payoutStatusLabelKey(item.status))} />
    </div>
  );
}

// 送金状態 → i18n ラベルキー
function payoutStatusLabelKey(status: PayoutStatus): string {
  if (status === "paid") return "staff.payoutStatusPaid";
  if (status === "failed") return "staff.payoutStatusFailed";
  return "staff.payoutStatusPending";
}

/** 送金状態のバッジ（着金済＝ローズ濃、申請中＝ローズ淡、失敗＝グレー）。 */
function PayoutStatusBadge({ status, label }: { status: PayoutStatus; label: string }) {
  // 状態ごとの見た目（トークンのみ）
  const cls =
    status === "paid"
      ? "bg-rose text-page"
      : status === "failed"
        ? "bg-surface-subtle text-muted border border-line"
        : "bg-rose-soft text-rose";
  return (
    <span className={`rounded-pill px-3 py-1 text-token-xs font-semibold ${cls}`}>{label}</span>
  );
}

/** 送金画面のローディング表示。 */
function PayoutLoading({ label }: { label: string }) {
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

/** 盾（本人確認・口座登録が要る、の含意）アイコン。要対応の案内に添える。 */
function ShieldIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** 送金履歴の行頭マーク（口座へ送金＝上向き矢印）アイコン。 */
function PayoutMarkIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V6" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  );
}

/** 銀行（着金口座）アイコン。残高カードの丸バッジ（42px）の中に収まるサイズ。 */
function BankIcon() {
  return (
    <svg
      width="22"
      height="22"
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
