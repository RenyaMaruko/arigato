import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { StoreModeSwitch } from "../../../components/common/StoreModeSwitch.js";

/**
 * 店員さん画面の共通ボトムナビ（ホーム / 履歴 / ⇄切替 / 所属店舗 / 設定）。
 * 現在地（active）をローズで強調し、それ以外は淡色にする。モック01/10 共通の下部ナビ。
 * 店側 StoreBottomNav と同じ作法（feature 跨ぎ import はしないため staff 用に新規実装）。
 * 掛け持ち（多対多）対応で、QR は所属店舗ごとに分かれるため、タブは「所属店舗」一覧への入口とする。
 * 中央には「店舗管理 ⇄ 店員」切替ボタン（StoreModeSwitch・§11.4）を置く。管理店を持つ人だけに出る（純店員は非表示）。
 */
type NavKey = "home" | "history" | "stores" | "settings";

// active は任意。タブに該当しない画面（送金・プロフィール編集・本人確認など）では未指定で渡し、
// その場合はどのタブもハイライトしない（全タブを淡色にする）。
export function StaffBottomNav({ active }: { active?: NavKey }) {
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
        <Link to="/staff" className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("home")}`}>
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
          <span className="text-[10px]">{t("staff.navHome")}</span>
        </Link>

        {/* 履歴（受取履歴） */}
        <Link
          to="/staff/history"
          className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("history")}`}
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
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
          </svg>
          <span className="text-[10px]">{t("staff.navHistory")}</span>
        </Link>

        {/* 中央の「店舗管理 ⇄ 店員」切替（管理店を持つ人のみ表示・§11.4） */}
        <StoreModeSwitch mode="staff" />

        {/* 所属店舗（店一覧→店ごとのQR詳細へ） */}
        <Link
          to="/staff/stores"
          className={`flex flex-1 flex-col items-center gap-[3px] pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] ${colorFor("stores")}`}
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
            <path d="M4 9.5 5.2 5h13.6L20 9.5" />
            <path d="M4 9.5V20h16V9.5" />
            <path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
            <path d="M10 20v-5h4v5" />
          </svg>
          <span className="text-[10px]">{t("staff.navStores")}</span>
        </Link>

        {/* 設定 */}
        <Link
          to="/staff/settings"
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
          <span className="text-[10px]">{t("staff.navSettings")}</span>
        </Link>
      </nav>
    </>
  );
}
