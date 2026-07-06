import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { useStoreSwitcher } from "../../../lib/store-switcher.js";
import { useCreateStore } from "../hooks/useStore.js";
// 店舗作成は店員ホームからの導線（店員モードの操作）なので、下部は店員のボトムナビを出す
import { StaffBottomNav } from "../../staff/components/StaffBottomNav.js";

/**
 * 店舗作成画面。ホームの「店舗作成」導線（/store/new）や、管理店が無いときの /store 入口から表示する。
 * 店名を入力し、導入承認（「うちで投げ銭OK」＝就業規則との整合の一手間）に同意して、
 * セルフサーブで自分の店舗を作成する（POST /store）。何店でも作れる（§11.4）。
 * 作成が完了したらチェック演出の完了画面を出し、「はじめる」で店舗管理（/store）へ入る。
 * 初回はボトムナビ中央の切替チュートリアルがそこで案内される。
 * 運営の事前発行・店舗ID入力（claim）は廃止した。
 */
export function StoreSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateStore();
  // 作成した店を「選択中の店」にして、完了画面の「はじめる」でそのまま管理モードに入れるようにする
  const { setSelectedStoreId } = useStoreSwitcher();

  // 入力（店名）と導入承認の同意チェック
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 作成が完了した店（完了画面の表示用。null の間は入力フォームを出す）
  const [createdName, setCreatedName] = useState<string | null>(null);

  // 店名が入力され、導入承認に同意したときだけ作成できる
  const canSubmit = name.trim() !== "" && agreed && !createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    // 店名＋導入承認の同意（adoptionAgreed=true）でセルフサーブ作成
    createMutation.mutate(
      { name: name.trim(), adoptionAgreed: true },
      {
        // 成功したら作成した店を選択中にして、完了画面（チェック演出＋はじめる）へ切り替える（§11.4）
        onSuccess: (store) => {
          setSelectedStoreId(store.id);
          setCreatedName(store.name);
        },
        onError: () => {
          setError(t("store.createError"));
        },
      },
    );
  };

  // 作成完了後: チェック演出の完了画面（投げ銭完了と同じトーン）。「はじめる」で店舗管理へ
  if (createdName !== null) {
    return (
      <PhoneFrame>
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-[26px] pb-[30px] pt-2">
          {/* 成功チェック（pop アニメ + 周囲の輝き spark） */}
          <div className="mt-20 flex justify-center">
            <div className="relative h-[108px] w-[108px] animate-pop">
              <div className="flex h-[108px] w-[108px] items-center justify-center rounded-full bg-rose text-token-display font-bold text-page">
                ✓
              </div>
              {/* 周囲の輝き（装飾・順に現れる） */}
              <span className="absolute -left-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.35s]">
                ＼
              </span>
              <span className="absolute -right-1 -top-1.5 animate-spark text-token-2xl text-rose-spark [animation-delay:.42s]">
                ／
              </span>
              <span className="absolute -left-5 top-3.5 animate-spark text-token-base text-rose-spark [animation-delay:.5s]">
                ·
              </span>
              <span className="absolute -right-5 top-3.5 animate-spark text-token-base text-rose-spark [animation-delay:.55s]">
                ·
              </span>
            </div>
          </div>

          {/* 作成した店名＋案内 */}
          <div className="mt-[30px] text-center text-token-2xl font-bold leading-[1.8] text-ink">
            {t("store.createdTitle", { name: createdName })}
          </div>
          <div className="mt-2 text-center text-token-md leading-relaxed text-ink-sub">
            {t("store.createdLead")}
          </div>

          {/* はじめる（店舗管理画面へ） */}
          <div className="mt-auto pt-[30px]">
            <button
              type="button"
              onClick={() => navigate({ to: "/store" })}
              className="w-full rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
            >
              {t("store.createdStart")}
            </button>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る・タイトル）。他画面と同様に左上へ戻る導線を置き、下にボトムナビを出す */}
      <div className="flex flex-none items-center justify-between bg-page px-[22px] pb-3.5 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/staff" })}
          aria-label={t("staff.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
        >
          <BackIcon />
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("store.createTitle")}</span>
        {/* レイアウト対称用のスペーサー */}
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-6 pb-7 pt-4">
        {/* 店舗作成フォーム（店名＋導入承認の同意） */}
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col">
          <label className="text-token-sm text-ink-sub" htmlFor="store-name">
            {t("store.createNameLabel")}
          </label>
          <input
            id="store-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t("store.createNamePlaceholder")}
            className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
          />

          {/* 導入承認の同意（店自身の一手間。就業規則との整合） */}
          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-line-soft px-4 py-4">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-rose"
            />
            <span className="text-token-base leading-relaxed text-ink-sub">
              {t("store.createAgreeLabel")}
            </span>
          </label>

          {error && (
            <div className="mt-4 rounded-xl bg-rose-soft px-4 py-3 text-token-sm text-rose">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-7 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
          >
            {createMutation.isPending ? t("store.loading") : t("store.createSubmit")}
          </button>
        </form>
      </div>

      {/* 下部ボトムナビ（店員モード。タブには該当しないため active 未指定） */}
      <StaffBottomNav />
    </PhoneFrame>
  );
}

// ヘッダー左上の戻る（山括弧）アイコン。他画面と同じ体裁
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
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
