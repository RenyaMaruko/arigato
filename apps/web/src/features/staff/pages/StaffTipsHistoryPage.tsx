import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { StaffTipItem, SettlementStatus } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe, useStaffTips } from "../hooks/useStaff.js";

/**
 * 受取履歴画面（/staff/history・モック04）。
 * 自分が受け取った投げ銭を金額・メッセージ・受取日時つきで一覧表示する（本人のみ）。
 * 金額（amount）を表示するのは本人スコープのこの画面だけ（横断ルール: 金額は本人のみ）。
 */
export function StaffTipsHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  // 自分のプロフィール（未作成・未ログインなら入口へ戻す）と受取履歴
  const meQuery = useStaffMe(isAuthenticated);
  const tipsQuery = useStaffTips(isAuthenticated && Boolean(meQuery.data));

  // 未ログイン・未作成なら入口（認証ゲート）へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // ローディング表示（認証・プロフィール・履歴のいずれか取得中）
  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <HistoryLoading label={t("staff.loading")} />;
  }

  const tips = tipsQuery.data;

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
        <span className="text-token-2xl font-bold text-ink">{t("staff.tipsTitle")}</span>
        {/* レイアウト対称用のスペーサー */}
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-5 pb-6 pt-4">
        {tipsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
            {t("staff.loading")}
          </div>
        ) : !tips || tips.items.length === 0 ? (
          // 受取がまだ無いときの空表示
          <div className="flex flex-1 items-center justify-center px-6 text-center text-token-md text-muted">
            {t("staff.tipsEmpty")}
          </div>
        ) : (
          <>
            {/* 合計（本人のみ） */}
            <div className="flex items-baseline justify-between px-0.5 pb-3">
              <span className="text-token-md font-bold text-ink">
                {tips.items.length} 件
              </span>
              <span className="text-token-base text-lang">
                {t("staff.tipsTotalLabel")}{" "}
                <span className="font-bold text-ink">¥{tips.totalAmount.toLocaleString()}</span>
              </span>
            </div>

            {/* 受取一覧（カード内に区切り線で並べる） */}
            <ul className="overflow-hidden rounded-2xl bg-page shadow-[0_2px_10px_rgba(20,20,40,.05)]">
              {tips.items.map((item, index) => (
                <li key={item.id}>
                  {index > 0 && <div className="mx-4 h-px bg-line-soft" />}
                  <TipHistoryRow item={item} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * 受取履歴の1行（日時・メッセージ・金額・着金状態）。
 * 金額は本人のみ閲覧可（この画面でのみ表示する）。
 */
function TipHistoryRow({ item }: { item: StaffTipItem }) {
  const { t } = useTranslation();
  // 受取日時を「M/D HH:mm」に整形する
  const date = new Date(item.receivedAt);
  const dateLabel = `${date.getMonth() + 1}/${date.getDate()}`;
  const timeLabel = `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className="flex gap-3 p-4">
      {/* 受取日（左の日付マーカー・モック04） */}
      <div className="w-[34px] flex-none pt-[18px] text-token-base font-bold text-lang">
        {dateLabel}
      </div>
      {/* お客さまのアバター枠（お客さまは匿名のため顔写真プレースホルダ） */}
      <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-rose-soft text-rose">
        <HeartIcon />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-token-xs text-muted-soft">
          {dateLabel} {timeLabel}
        </div>
        {/* 所属店名（送信時点の店） */}
        <div className="mt-0.5 truncate text-token-md font-bold text-ink">{item.storeName}</div>
        {item.message ? (
          <div className="mt-1 whitespace-pre-line text-token-sm leading-snug text-ink-sub">
            {item.message}
          </div>
        ) : (
          <div className="mt-1 text-token-sm text-muted">{t("staff.tipsNoMessage")}</div>
        )}
      </div>
      {/* 金額（本人のみ）と着金状態 */}
      <div className="flex flex-none flex-col items-end">
        <div className="text-token-lg font-bold text-ink">¥{item.amount.toLocaleString()}</div>
        <SettlementBadge status={item.settlementStatus} />
      </div>
    </div>
  );
}

/**
 * 着金状態（保留 / 着金可能 / 着金済）のバッジ。
 */
function SettlementBadge({ status }: { status: SettlementStatus }) {
  const { t } = useTranslation();
  const map: Record<SettlementStatus, { label: string; className: string }> = {
    held: {
      label: t("staff.tipsSettlementHeld"),
      className: "bg-rose-soft text-rose",
    },
    payable: {
      label: t("staff.tipsSettlementPayable"),
      className: "bg-rose-soft text-rose",
    },
    paid: {
      label: t("staff.tipsSettlementPaid"),
      className: "bg-surface-subtle text-ink-sub",
    },
  };
  const { label, className } = map[status];
  return (
    <span
      className={`mt-2 inline-block rounded-pill px-2.5 py-0.5 text-token-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/** 受取履歴画面のローディング表示（スマホ枠内で中央寄せ）。 */
function HistoryLoading({ label }: { label: string }) {
  return (
    <PhoneFrame>
      <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
        {label}
      </div>
    </PhoneFrame>
  );
}

/** お客さまアバター枠に置くハート（匿名のお客さまのプレースホルダ）。 */
function HeartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.6 5.5 4.7 4.6 6.8 4 8.8 4.9 10 6.6c.4.5.7 1 .9 1.4.2-.4.5-.9.9-1.4C13 4.9 15 4 17.1 4.6c3.1.9 4.1 4.4 2.7 7.2C19.5 16.4 12 21 12 21z" />
    </svg>
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
