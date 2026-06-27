import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StaffBottomNav } from "../components/StaffBottomNav.js";
import { useAuthSession } from "../hooks/useAuthSession.js";
import { useStaffMe } from "../hooks/useStaff.js";

/**
 * 所属店舗の一覧画面（/staff/stores）。ボトムナビ「所属店舗」タブの行き先。
 * 多対多モデル（掛け持ち）に合わせ、所属している店を縦に並べる。1店だけでも一覧を経由する。
 * 店をタップすると、その店の詳細（店ごとのQR）へ進む（/staff/stores/:membershipId）。
 */
export function StaffStoresPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // ログイン状態と自分のプロフィール（所属一覧＝memberships を含む）を取得
  const { isAuthenticated, loading: authLoading } = useAuthSession();
  const meQuery = useStaffMe(isAuthenticated);

  // 未ログイン・未作成なら入口（認証ゲート）へ戻す。リダイレクトは副作用で行う
  const me = meQuery.data;
  const shouldRedirect = !authLoading && !meQuery.isLoading && (!isAuthenticated || !me);
  useEffect(() => {
    if (shouldRedirect) {
      navigate({ to: "/staff" });
    }
  }, [shouldRedirect, navigate]);

  // 認証情報の取得中・リダイレクト待ちはローディング表示
  if (authLoading || (isAuthenticated && meQuery.isLoading) || !me) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 items-center justify-center text-token-md text-ink-sub">
          {t("staff.loading")}
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      {/* ヘッダー（タイトル） */}
      <div className="flex flex-none items-center justify-center px-[22px] pb-1.5 pt-2">
        <span className="text-token-2xl font-bold text-ink">{t("staff.storesTitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-7 pt-4">
        {me.memberships.length === 0 ? (
          // 所属がまだ無いとき（招待リンクからの参加を促す）
          <div className="mt-3 rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-5 text-center text-token-sm leading-relaxed text-ink-sub">
            {t("staff.homeNoStores")}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {me.memberships.map((m) => (
              // 1店ぶんのカード（タップで店舗詳細＝店ごとのQRへ）
              <button
                key={m.membershipId}
                type="button"
                onClick={() =>
                  navigate({
                    to: "/staff/stores/$membershipId",
                    params: { membershipId: m.membershipId },
                  })
                }
                className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-page px-4 py-3.5 text-left"
              >
                {/* 店のしるし（ローズ淡色の丸） */}
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-rose-soft text-rose">
                  <StoreIcon />
                </span>
                <span className="min-w-0 flex-1 truncate text-token-md font-semibold text-ink">
                  {m.storeName}
                </span>
                {/* タップできることを示す右シェブロン */}
                <span className="flex-none text-muted-soft">
                  <ChevronIcon />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 下部ボトムナビ（現在地＝所属店舗） */}
      <StaffBottomNav active="stores" />
    </PhoneFrame>
  );
}

/** 店（建物）アイコン（所属店のしるし）。 */
function StoreIcon() {
  return (
    <svg
      width="18"
      height="18"
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
  );
}

/** 右シェブロン（タップで詳細へ進む含意）。 */
function ChevronIcon() {
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
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
