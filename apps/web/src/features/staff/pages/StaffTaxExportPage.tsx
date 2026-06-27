import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe } from "../hooks/useStaff.js";
import { downloadTaxReport } from "../api/staff.api.js";

/**
 * 申告データ出力画面（/staff/export・モック08）。
 * 受取記録（受取日 / 金額 / 店名）を CSV でダウンロードできる（本人のみ）。
 * 対象年を選び「CSVをダウンロード」で本人スコープの API から CSV を取得して保存する。
 */
export function StaffTaxExportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);

  // 対象年（既定は今年）。直近5年から選べるようにする
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  // ダウンロードの状態（多重押下防止・エラー表示）
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);

  // 未ログイン・未作成なら入口へ戻す
  const shouldRedirect =
    !authLoading && !meQuery.isLoading && (!isAuthenticated || !meQuery.data);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  if (authLoading || meQuery.isLoading || !meQuery.data) {
    return <ExportLoading label={t("staff.loading")} />;
  }

  // 選べる年の候補（直近5年）
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // CSV をダウンロードする（本人スコープ・受取記録）
  const handleDownload = async () => {
    setError(false);
    setDownloading(true);
    try {
      await downloadTaxReport(year);
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル） */}
      <div className="flex flex-none items-center gap-3.5 px-[22px] pb-[18px] pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("staff.exportTitle")}</span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-[26px] pb-7 pt-6">
        {/* CSV ファイルのアイコン（装飾） */}
        <div className="mt-4 flex justify-center">
          <div className="relative h-[104px] w-[84px] rounded-[10px] border-2 border-line bg-page shadow-[0_4px_14px_rgba(20,20,40,.06)]">
            <div className="absolute right-0 top-0 h-[26px] w-[26px] rounded-bl-[10px] border-b-2 border-l-2 border-line bg-stamp-bg" />
            <div className="absolute left-0 right-0 top-[26px] flex justify-center">
              <span className="rounded-[5px] bg-[#3fbf7f] px-2.5 py-[3px] text-token-base font-bold text-page">
                CSV
              </span>
            </div>
            <div className="absolute bottom-3.5 left-3.5 right-3.5 flex h-[30px] items-end gap-1">
              <span className="h-1/2 flex-1 rounded-[2px] bg-rose-spark" />
              <span className="h-[80%] flex-1 rounded-[2px] bg-rose" />
              <span className="h-[35%] flex-1 rounded-[2px] bg-rose-spark" />
              <span className="h-[65%] flex-1 rounded-[2px] bg-rose" />
            </div>
          </div>
        </div>

        {/* 説明文 */}
        <div className="mt-6 whitespace-pre-line text-center text-token-md leading-relaxed text-ink-label">
          {t("staff.exportLead")}
        </div>

        {/* 対象年の選択（ネイティブ select をトークンの枠で見せる） */}
        <label className="relative mt-7 flex items-center justify-between rounded-lg border-[1.5px] border-line px-4 py-3.5">
          <span className="text-token-md text-ink">
            {year}
            {t("staff.exportYearSuffix")}
          </span>
          <span className="pointer-events-none text-muted">
            <ChevronDownIcon />
          </span>
          {/* 透明な select を重ね、見た目はトークンの枠を使う */}
          <select
            aria-label={t("staff.exportTitle")}
            value={year}
            onChange={(e) => setYear(Number.parseInt(e.target.value, 10))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
                {t("staff.exportYearSuffix")}
              </option>
            ))}
          </select>
        </label>

        {/* エラー表示 */}
        {error && (
          <div className="mt-4 rounded-xl border border-rose-spark/60 bg-rose-soft px-4 py-3 text-center text-token-sm text-rose">
            {t("staff.exportError")}
          </div>
        )}

        {/* ダウンロードボタン */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="mt-6 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
        >
          {downloading ? t("staff.exportDownloading") : t("staff.exportDownload")}
        </button>
      </div>

      {/* 下部ボトムナビ（申告データ出力はタブに該当しないため active 未指定） */}
      <StaffBottomNav />
    </PhoneFrame>
  );
}

/** 申告データ出力画面のローディング表示。 */
function ExportLoading({ label }: { label: string }) {
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

/** 下向きシェブロン（年選択）。 */
function ChevronDownIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
