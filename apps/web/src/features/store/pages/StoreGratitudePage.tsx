import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StoreProfile, StoreGratitude } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { computePeriodRange, PERIODS, type Period } from "../../../lib/period.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreGratitude } from "../hooks/useStore.js";
import { formatRelativeTime } from "../utils/format.js";

/**
 * 感謝の記録画面（/store/gratitude）。モック06に対応。
 *
 * 期間（すべて／今月／先月／今年）で絞り込める。総投げ銭（totalCount）・お客さまの声・スタッフ別件数が
 * 選んだ期間に連動する。期間セレクタは店員側の受取履歴と同じピル型のトーン（rose 系・絞り込み中が分かる）。
 *
 * 最重要原則: 金額（amount / customer_total / platform_fee）・残高・着金は画面のどこにも表示しない。
 * スタッフ別件数は名簿順（中立）で並べ、件数で順位付け・並べ替えしない。
 */
export function StoreGratitudePage() {
  return <StoreGuard>{(store) => <StoreGratitudeContent store={store} />}</StoreGuard>;
}

function StoreGratitudeContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();

  // 期間プリセット（すべて／今月／先月／今年）。選択を from/to（ISO）に変換して取得に渡す
  const [period, setPeriod] = useState<Period>("all");
  // period から from/to を計算する（純粋関数）。期間が変わると useStoreGratitude が自動再取得する
  const range = useMemo(() => computePeriodRange(period), [period]);
  const gratitudeQuery = useStoreGratitude(store.id, range);
  const gratitude = gratitudeQuery.data;

  // タブ（お店全体 / スタッフ別）
  const [tab, setTab] = useState<"store" | "staff">("store");

  return (
    <PhoneFrame>
      {/* タイトル */}
      <div className="flex-none px-5 pb-3.5 pt-2 text-center">
        <span className="text-token-2xl font-bold text-ink">{t("store.gratitudeTitle")}</span>
      </div>

      {/* 期間セレクタ（ヒーローの上・タブの近く）。すべて／今月／先月／今年 */}
      <div className="flex flex-none items-center px-5 pb-3">
        <PeriodSelect
          ariaLabel={t("store.gratitudePeriodLabel")}
          value={period}
          onChange={(v) => setPeriod(v)}
        />
      </div>

      {/* タブ */}
      <div className="flex flex-none px-6">
        <button
          type="button"
          onClick={() => setTab("store")}
          className={`flex-1 border-b-[2.5px] pb-2.5 text-center ${
            tab === "store" ? "border-rose" : "border-line-soft"
          }`}
        >
          <span
            className={`text-token-md ${tab === "store" ? "font-bold text-rose" : "font-semibold text-muted"}`}
          >
            {t("store.gratitudeTabStore")}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("staff")}
          className={`flex-1 border-b-[2.5px] pb-2.5 text-center ${
            tab === "staff" ? "border-rose" : "border-line-soft"
          }`}
        >
          <span
            className={`text-token-md ${tab === "staff" ? "font-bold text-rose" : "font-semibold text-muted"}`}
          >
            {t("store.gratitudeTabStaff")}
          </span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-5">
        {tab === "store" ? (
          <StoreWideTab gratitude={gratitude} />
        ) : (
          <PerStaffTab gratitude={gratitude} />
        )}
      </div>

      <StoreBottomNav active="gratitude" />
    </PhoneFrame>
  );
}

/**
 * お店全体タブ: 選んだ期間の総投げ銭（件数）とお客さまの声フィード。金額は出さない。
 * 期間別の3カード（今日/今週/今月）と今週バッジは期間セレクタと重複するため置かない。
 */
function StoreWideTab({ gratitude }: { gratitude: StoreGratitude | undefined }) {
  const { t } = useTranslation();
  const voices = gratitude?.voices ?? [];

  return (
    <>
      {/* 総投げ銭（選んだ期間の件数。金額ではない） */}
      <div className="whitespace-pre-line text-token-md leading-snug text-ink-label">
        {t("store.gratitudeHeroTitle")}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[40px] font-bold leading-none text-ink">
          {gratitude?.totalCount ?? 0}
        </span>
        <span className="text-token-xl font-semibold text-ink">
          {t("store.gratitudeCountSuffix")}
        </span>
      </div>

      {/* お客さまの声 */}
      <div className="mt-7 text-token-md font-bold text-ink">
        {t("store.gratitudeVoicesTitle")}{" "}
        <span className="text-token-sm font-normal text-muted">
          {t("store.gratitudeVoicesNote")}
        </span>
      </div>
      <div className="mt-3.5 flex flex-col gap-3">
        {voices.length === 0 ? (
          <div className="rounded-xl border border-line-soft px-4 py-5 text-center text-token-sm text-muted">
            {t("store.gratitudeNoVoices")}
          </div>
        ) : (
          voices.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-xl border border-line-soft px-4 py-3.5"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-token-lg">
                🙂
              </span>
              <div className="flex-1">
                <div className="text-token-base text-ink">{v.message}</div>
                <div className="mt-1 text-token-xs text-muted">
                  {formatRelativeTime(v.receivedAt)} ・ {v.staffName}
                  {t("store.san")}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/**
 * スタッフ別タブ: スタッフごとの「ありがとう件数」（選んだ期間）。名簿順（中立）で、件数で順位付けしない。金額は出さない。
 */
function PerStaffTab({ gratitude }: { gratitude: StoreGratitude | undefined }) {
  const { t } = useTranslation();
  const perStaff = gratitude?.perStaff ?? [];

  return (
    <>
      <div className="text-token-md font-bold text-ink">
        {t("store.gratitudePerStaffTitle")}
      </div>
      <div className="mt-1 text-token-sm text-muted">{t("store.gratitudePerStaffNote")}</div>

      <div className="mt-4 flex flex-col gap-3">
        {perStaff.length === 0 ? (
          <div className="rounded-xl border border-line-soft px-4 py-5 text-center text-token-sm text-muted">
            {t("store.gratitudeNoStaff")}
          </div>
        ) : (
          perStaff.map((p) => (
            <div
              key={p.staffId}
              className="flex items-center gap-3.5 rounded-xl border border-line-soft px-4 py-3.5"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-token-sm text-muted">
                員
              </span>
              <div className="flex-1 text-token-md font-semibold text-ink">{p.staffName}</div>
              {/* 件数（金額ではない） */}
              <span className="text-token-md font-bold text-rose">
                {t("store.gratitudePerStaffCount", { count: p.count })}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/**
 * 期間セレクタ（すべて／今月／先月／今年）。
 * ネイティブ select を「軽やかで押しやすい」ピル型に整える（店員側の受取履歴と同じトーン）。
 * 既定（すべて）以外を選ぶと、絞り込み中と分かるようにローズ塗りにする。
 * インラインスタイルは使わず Tailwind ユーティリティで書く。
 */
function PeriodSelect({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: Period;
  onChange: (value: Period) => void;
}) {
  const { t } = useTranslation();
  // 各プリセットの表示ラベル（i18n）
  const labels: Record<Period, string> = {
    all: t("store.gratitudePeriodAll"),
    thisMonth: t("store.gratitudePeriodThisMonth"),
    lastMonth: t("store.gratitudePeriodLastMonth"),
    thisYear: t("store.gratitudePeriodThisYear"),
  };
  // 「すべて」以外を選んでいたら「絞り込み中」として強調する
  const isActive = value !== "all";
  // 選択状態に応じてピルの色を切り替える（既定=白枠、絞り込み中=ローズ塗り）
  const pillClass = isActive ? "border-rose bg-rose text-page" : "border-line bg-page text-ink-label";

  return (
    <div className="relative inline-flex">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        className={`h-9 appearance-none rounded-pill border-[1.5px] pl-3.5 pr-8 text-token-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-spark/60 ${pillClass}`}
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {labels[p]}
          </option>
        ))}
      </select>
      {/* 右端の▾（クリックは下の select に通す）。色はピルの状態に合わせる */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-2.5 flex items-center ${
          isActive ? "text-page" : "text-ink-sub"
        }`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
