import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { useStoreGratitude } from "../hooks/useStore.js";
import { formatRelativeTime } from "../utils/format.js";

/**
 * 店ホーム（ログイン後の起点・/store）。モック01に対応。
 * お店全体に届いた「ありがとう」の件数と、最近のお客さまの声を表示する。
 * 金額は一切表示しない（件数とメッセージだけ）。下部にボトムナビを置く。
 */
export function StoreHomePage({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // 感謝サマリ（件数・お客さまの声）。金額は含まれない
  const gratitudeQuery = useStoreGratitude(store.id);
  const gratitude = gratitudeQuery.data;

  // 直近の声は3件だけホームに出す
  const recentVoices = gratitude?.voices.slice(0, 3) ?? [];

  return (
    <PhoneFrame>
      {/* 店名ヘッダー（ロゴ・店名・通知ベル） */}
      <div className="flex flex-none items-center justify-between px-5 pb-4 pt-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-rose-soft text-token-sm text-muted">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="h-9 w-9 rounded-full object-cover" />
            ) : (
              "店"
            )}
          </div>
          <span className="text-token-xl font-bold text-ink">{store.name}</span>
        </div>
        <span className="text-ink" aria-label={t("store.homeBell")}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 pt-1">
        {/* ヒーロー: お店全体に届いた「ありがとう」の件数（金額ではない） */}
        <div className="rounded-2xl border border-rose-soft bg-rose-soft/40 p-5">
          <div className="whitespace-pre-line text-token-md leading-snug text-rose">
            {t("store.homeHeroTitle")}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[42px] font-bold leading-none text-ink">
              {gratitude?.totalCount ?? 0}
            </span>
            <span className="text-token-xl font-semibold text-ink">{t("store.homeCountSuffix")}</span>
            <span className="ml-0.5 text-[24px]" aria-hidden="true">
              ❤️
            </span>
          </div>
          <div className="mt-1.5">
            <span className="inline-block rounded-pill bg-rose-soft px-2.5 py-[3px] text-token-sm font-bold text-rose">
              {t("store.homeWeekBadge", { count: gratitude?.weekCount ?? 0 })}
            </span>
          </div>
        </div>

        {/* 最近のお客さまの声 */}
        <div className="mt-6 text-token-md font-bold text-ink">{t("store.homeRecentVoices")}</div>
        <div className="mt-3.5 flex flex-col gap-3">
          {recentVoices.length === 0 ? (
            <div className="rounded-xl border border-line-soft px-4 py-5 text-center text-token-sm text-muted">
              {t("store.homeNoVoices")}
            </div>
          ) : (
            recentVoices.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-3 rounded-xl border border-line-soft px-4 py-3.5"
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-token-xl">
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

        {/* すべての声を見る（感謝の可視化へ） */}
        <button
          type="button"
          onClick={() => navigate({ to: "/store/gratitude" })}
          className="mt-4 flex items-center gap-1.5 text-token-base font-bold text-rose"
        >
          {t("store.homeSeeAllVoices")}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <StoreBottomNav active="home" />
    </PhoneFrame>
  );
}
