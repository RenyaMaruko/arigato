import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { StoreProfile, StoreGratitude } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreGratitude } from "../hooks/useStore.js";
import { formatRelativeTime } from "../utils/format.js";

/**
 * 感謝の可視化画面（/store/gratitude）。モック06に対応。
 *
 * 店全体の「ありがとう」件数（累計・今日・今週・今月）と、お客さまの声（メッセージ・いつ・誰宛か）、
 * スタッフ別の件数を表示する。
 *
 * 最重要原則: 金額（amount / customer_total / platform_fee）・残高・着金は画面のどこにも表示しない。
 * スタッフ別件数は名簿順（中立）で並べ、件数で順位付け・並べ替えしない。
 */
export function StoreGratitudePage() {
  return <StoreGuard>{(store) => <StoreGratitudeContent store={store} />}</StoreGuard>;
}

function StoreGratitudeContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const gratitudeQuery = useStoreGratitude(store.id);
  const gratitude = gratitudeQuery.data;

  // タブ（お店全体 / スタッフ別）
  const [tab, setTab] = useState<"store" | "staff">("store");

  return (
    <PhoneFrame>
      {/* タイトル */}
      <div className="flex-none px-5 pb-3.5 pt-2 text-center">
        <span className="text-token-2xl font-bold text-ink">{t("store.gratitudeTitle")}</span>
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
 * お店全体タブ: 件数（累計・今日・今週・今月）とお客さまの声フィード。金額は出さない。
 */
function StoreWideTab({ gratitude }: { gratitude: StoreGratitude | undefined }) {
  const { t } = useTranslation();
  const voices = gratitude?.voices ?? [];

  return (
    <>
      {/* 累計件数 */}
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
        <span className="ml-0.5 text-[24px]" aria-hidden="true">
          ❤️
        </span>
      </div>
      <div className="mt-1.5">
        <span className="inline-block rounded-pill bg-rose-soft px-2.5 py-[3px] text-token-sm font-bold text-rose">
          {t("store.gratitudeWeekBadge", { count: gratitude?.weekCount ?? 0 })}
        </span>
      </div>

      {/* 期間別件数（今日 / 今週 / 今月）。金額ではなく件数 */}
      <div className="mt-5 grid grid-cols-3 gap-3">
        <PeriodCard label={t("store.gratitudeToday")} count={gratitude?.todayCount ?? 0} />
        <PeriodCard label={t("store.gratitudeWeek")} count={gratitude?.weekCount ?? 0} />
        <PeriodCard label={t("store.gratitudeMonth")} count={gratitude?.monthCount ?? 0} />
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
 * スタッフ別タブ: スタッフごとの「ありがとう件数」。名簿順（中立）で、件数で順位付けしない。金額は出さない。
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
 * 期間別件数カード（今日 / 今週 / 今月）。件数のみ。
 */
function PeriodCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border border-line-soft px-3 py-3 text-center">
      <div className="text-token-2xl font-bold text-ink">{count}</div>
      <div className="mt-0.5 text-token-xs text-muted">{label}</div>
    </div>
  );
}
