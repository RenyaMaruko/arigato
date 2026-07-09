import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { StoreModeSwitch } from "../../../components/common/StoreModeSwitch.js";

/**
 * 店画面の共通ボトムナビ（ホーム / スタッフ / ⇄切替 / 記録 / 設定）。
 * 現在地（active）をローズで強調し、それ以外は淡色にする。モック01/03/06/07 共通の下部ナビ。
 * 中央には「店舗管理 ⇄ 店員」切替ボタン（StoreModeSwitch・§11.4）を置き、店員モードへ戻せる。
 * 管理店を持つ人だけに出る（店の管理画面には管理者しか来ないため実質常に表示される）。
 */
type NavKey = "home" | "staff" | "gratitude" | "settings";

// active は任意。タブに該当しない画面では未指定で渡し、その場合はどのタブもハイライトしない。
export function StoreBottomNav({ active }: { active?: NavKey }) {
  const { t } = useTranslation();

  // 各タブの色（現在地はローズ・それ以外＝未指定含むは淡いグレー）
  const colorFor = (key: NavKey) => (active === key ? "text-rose" : "text-muted-soft");

  // ドキュメントスクロール方式（PhoneFrame 参照）に合わせ、ナビ本体は fixed で画面下に固定し、
  // 通常フローには同じ高さのスペーサーを置いてページ下端がナビの裏に隠れないようにする。
  // 中央寄せは left/right + mx-auto で行う（translate を使うと transform が containing block になり、
  // 中の StoreModeSwitch が出す fixed のシート／チュートリアルがナビ内に閉じ込められるため）。
  // 下端はホームバー用に safe-area 分だけ広げる（従来の pb-4=16px を最低値として維持）。
  return (
    <>
      {/* 通常フロー側のスペーサー（fixed のナビ本体と同じ高さを確保する透明 div） */}
      <div
        aria-hidden="true"
        className="h-[calc(65px+max(1rem,env(safe-area-inset-bottom,0px)))] flex-none"
      />
      <nav className="fixed bottom-0 left-0 right-0 z-30 mx-auto flex w-full max-w-app items-stretch border-t border-line-soft bg-page">
        {/* ホーム */}
        <Link to="/store" className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("home")}`}>
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.7V20h5v-6h4v6h5V9.7" />
          </svg>
          <span className="text-[10px]">{t("store.navHome")}</span>
        </Link>

        {/* スタッフ */}
        <Link
          to="/store/staff"
          className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("staff")}`}
        >
          <svg
            width="23"
            height="23"
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
          <span className="text-[10px]">{t("store.navStaff")}</span>
        </Link>

        {/* 中央の「店舗管理 ⇄ 店員」切替（店員モードへ戻す・§11.4） */}
        <StoreModeSwitch mode="store" />

        {/* 感謝の可視化 */}
        <Link
          to="/store/gratitude"
          className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("gratitude")}`}
        >
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 5h16a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 20 16H9l-4 3v-3.2A1.5 1.5 0 0 1 3.5 14.3V6.5A1.5 1.5 0 0 1 5 5z" />
            <circle cx="9" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
            <circle cx="13" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-[10px]">{t("store.navGratitude")}</span>
        </Link>

        {/* 設定 */}
        <Link
          to="/store/settings"
          className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("settings")}`}
        >
          <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
          </svg>
          <span className="text-[10px]">{t("store.navSettings")}</span>
        </Link>
      </nav>
    </>
  );
}
