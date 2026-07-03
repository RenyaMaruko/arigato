import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { StoreManagedListResponseSchema } from "@arigato/shared";
import { apiClient } from "../../lib/api-client.js";
import { useAuthSession } from "../../lib/use-auth-session.js";
import { useStoreSwitcher } from "../../lib/store-switcher.js";

/**
 * ボトムナビ中央の「店舗管理 ⇄ 店員」切替ボタン（§11.4）。
 *
 * 店員側 StaffBottomNav・店側 StoreBottomNav の両方の中央に置く共通ボタン。
 * feature 同士の直接 import を避けるため、共有（components/common）に置き、
 * 管理店の一覧（GET /store/mine）は lib の apiClient と shared スキーマで自前に引く。
 *
 * 表示条件: 管理する店を1つ以上持つ人だけに出す（純店員には出さない＝null を返す）。
 * 押下時の分岐:
 *  - mode="staff"（店員モード）→ 店の管理へ。管理店が1件ならそのまま /store へ直行、
 *    複数件なら一覧シートを開いて選ばせ、選んだ店を選択して /store へ。
 *  - mode="store"（管理モード）→ 店員モード（/staff）へ戻す。
 * 初回のみ（switchTutorialSeen=false）、中央ボタンで切り替えられる旨のコーチマークを1回だけ出す。
 */
export function StoreModeSwitch({ mode }: { mode: "staff" | "store" }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthSession();
  const { setSelectedStoreId, switchTutorialSeen, markSwitchTutorialSeen } = useStoreSwitcher();

  // 選択シート（複数店の選択）の開閉
  const [sheetOpen, setSheetOpen] = useState(false);

  // 管理する店の一覧（中央ナビの表示条件・分岐に使う）。useManagedStores と同じキーでキャッシュ共有する
  const managedQuery = useQuery({
    queryKey: ["store", "mine"],
    queryFn: async () => {
      const res = await apiClient.store.mine.$get();
      if (!res.ok) {
        throw new Error(`store mine request failed: ${res.status}`);
      }
      return StoreManagedListResponseSchema.parse(await res.json());
    },
    enabled: isAuthenticated,
    retry: false,
  });

  const items = managedQuery.data?.items ?? [];

  // 表示条件: 管理する店が無い（純店員）・未取得・未ログインなら中央ボタンを出さない
  if (!isAuthenticated || items.length === 0) {
    return null;
  }

  // 選んだ店を管理モードで開く（選択を永続して /store へ）
  const openStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    setSheetOpen(false);
    navigate({ to: "/store" });
  };

  // 中央ボタン押下時の分岐（モードで向きが変わる）
  const handlePress = () => {
    if (mode === "store") {
      // 管理モード → 店員モードへ戻す
      navigate({ to: "/staff" });
      return;
    }
    // 店員モード → 店の管理へ。1件なら直行・複数なら一覧から選ばせる
    if (items.length === 1) {
      openStore(items[0]!.id);
    } else {
      setSheetOpen(true);
    }
  };

  // 初回のみのチュートリアル（コーチマーク）。中央ボタンが初めて見えたモードで1回だけ出す
  // （店作成後の着地は店舗管理＝store モードなので、モードを限定しない。文言もモード中立）。
  const showTutorial = !switchTutorialSeen && !sheetOpen;

  return (
    <>
      {/* 中央の切替ボタン（一段目立つローズの丸ボタン・少し持ち上げる） */}
      <div className="relative flex flex-none flex-col items-center">
        <button
          type="button"
          onClick={handlePress}
          className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-rose text-page shadow-phone"
          aria-label={mode === "staff" ? t("mode.toStore") : t("mode.toStaff")}
        >
          {mode === "staff" ? <StoreIcon /> : <StaffIcon />}
        </button>
        <span className="mt-[3px] text-[10px] text-rose">
          {mode === "staff" ? t("mode.toStore") : t("mode.toStaff")}
        </span>
      </div>

      {/* 初回チュートリアル（コーチマーク）。スマホ枠を覆うスクリム＋中央ボタン上の吹き出しで1回だけ案内する */}
      {showTutorial && (
        <div className="absolute inset-0 z-50">
          {/* 背面スクリム（タップで閉じる＝見たことにする） */}
          <button
            type="button"
            aria-label={t("mode.tutorialGotIt")}
            onClick={markSwitchTutorialSeen}
            className="absolute inset-0 cursor-default bg-scrim"
          />
          {/* 吹き出し本体（下部ナビの中央ボタンの真上あたり） */}
          <div className="absolute bottom-[86px] left-1/2 w-[220px] -translate-x-1/2 rounded-xl bg-page p-4 text-center shadow-phone">
            <div className="text-token-base font-bold text-ink">{t("mode.tutorialTitle")}</div>
            <div className="mt-1.5 text-token-sm leading-relaxed text-ink-sub">
              {t("mode.tutorialBody")}
            </div>
            <button
              type="button"
              onClick={markSwitchTutorialSeen}
              className="mt-3 w-full rounded-xl bg-rose py-2.5 text-token-sm font-bold text-page"
            >
              {t("mode.tutorialGotIt")}
            </button>
            {/* 下向きの吹き出しのしっぽ（中央ボタンを指す） */}
            <div className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-page" />
          </div>
        </div>
      )}

      {/* 管理店が複数のときの選択シート（選んだ店の管理画面へ） */}
      {sheetOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          {/* 背面スクリム */}
          <button
            type="button"
            aria-label={t("mode.close")}
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 cursor-default bg-scrim"
          />
          {/* シート本体（管理店の一覧） */}
          <div className="relative max-h-[70%] overflow-y-auto rounded-t-2xl bg-page px-5 pb-8 pt-4">
            <div className="mx-auto mb-3 h-1 w-9 rounded-pill bg-handle" />
            <div className="mb-3 text-center text-token-md font-bold text-ink">
              {t("mode.selectStoreTitle")}
            </div>
            <div className="flex flex-col gap-2.5">
              {items.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openStore(s.id)}
                  className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-page px-4 py-3.5 text-left"
                >
                  {/* 店ロゴ（未設定はローズ淡色の丸＋建物アイコン） */}
                  <span className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-rose-soft text-rose">
                    {s.logoUrl ? (
                      <img src={s.logoUrl} alt={s.name} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <StoreIcon small />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-token-md font-semibold text-ink">
                    {s.name}
                  </span>
                  {/* オーナーの店にはバッジを出す */}
                  {s.role === "owner" && (
                    <span className="flex-none rounded-pill bg-rose-soft px-2 py-[2px] text-token-xs font-bold text-rose">
                      {t("mode.ownerBadge")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 店（建物）アイコン。中央ボタン（店の管理へ）・選択シートの店アイコンに使う。 */
function StoreIcon({ small }: { small?: boolean }) {
  const size = small ? 18 : 24;
  return (
    <svg
      width={size}
      height={size}
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

/** 店員（人物）アイコン。中央ボタン（店員モードへ戻る）に使う。 */
function StaffIcon() {
  return (
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
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c0-4 3.5-6 7.5-6s7.5 2 7.5 6" />
    </svg>
  );
}
