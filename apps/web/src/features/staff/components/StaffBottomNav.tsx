import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

/**
 * 店員さん画面の共通ボトムナビ（ホーム / 履歴 / QR / 設定）。
 * 現在地（active）をローズで強調し、それ以外は淡色にする。モック01/10 共通の下部ナビ。
 * 店側 StoreBottomNav と同じ作法（feature 跨ぎ import はしないため staff 用に新規実装）。
 */
type NavKey = "home" | "history" | "qr" | "settings";

export function StaffBottomNav({ active }: { active: NavKey }) {
  const { t } = useTranslation();

  // 各タブの色（現在地はローズ・それ以外は淡いグレー）
  const colorFor = (key: NavKey) => (active === key ? "text-rose" : "text-muted-soft");

  return (
    <nav className="flex flex-none items-center justify-around border-t border-line-soft px-1.5 pb-4 pt-2.5">
      {/* ホーム */}
      <Link to="/staff" className={`flex flex-col items-center gap-[3px] ${colorFor("home")}`}>
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
        className={`flex flex-col items-center gap-[3px] ${colorFor("history")}`}
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

      {/* QR（店ごとのQR） */}
      <Link to="/staff/qr" className={`flex flex-col items-center gap-[3px] ${colorFor("qr")}`}>
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
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3M21 14v7M17 21h4M14 18.5v2.5" />
        </svg>
        <span className="text-[10px]">{t("staff.navQr")}</span>
      </Link>

      {/* 設定 */}
      <Link
        to="/staff/settings"
        className={`flex flex-col items-center gap-[3px] ${colorFor("settings")}`}
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
  );
}
