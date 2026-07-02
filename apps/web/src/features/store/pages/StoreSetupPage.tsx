import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { signOut } from "../../../lib/auth.js";
import { useStoreSwitcher } from "../../../lib/store-switcher.js";
import { useCreateStore } from "../hooks/useStore.js";

/**
 * 店舗作成画面。ホームの「店舗作成」導線（/store/new）や、管理店が無いときの /store 入口から表示する。
 * 店名を入力し、導入承認（「うちで投げ銭OK」＝就業規則との整合の一手間）に同意して、
 * セルフサーブで自分の店舗を作成する（POST /store）。何店でも作れる（§11.4）。
 * 作成が完了したら店員ホーム（/staff）へ戻り、ボトムナビ中央の切替ボタンから管理モードに入れる。
 * 運営の事前発行・店舗ID入力（claim）は廃止した。
 */
export function StoreSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateStore();
  // 作成した店を「選択中の店」にして、中央ナビ切替でそのまま管理モードに入れるようにする
  const { setSelectedStoreId } = useStoreSwitcher();

  // 入力（店名）と導入承認の同意チェック
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // 成功したら作成した店を選択中にして店員ホーム（/staff）へ戻す（§11.4）。
        // 店員ホーム＋中央ナビ切替ボタンが出現し、初回のみ切替チュートリアルが案内される。
        onSuccess: (store) => {
          setSelectedStoreId(store.id);
          navigate({ to: "/staff" });
        },
        onError: () => {
          setError(t("store.createError"));
        },
      },
    );
  };

  // ログアウト（別アカウントでやり直す導線）
  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/store" });
  };

  return (
    <PhoneFrame>
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto [&>*]:shrink-0 px-6 pb-7 pt-2">
        {/* 上部: ログアウト */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="text-token-sm text-ink-sub underline-offset-2 hover:underline"
          >
            {t("store.logout")}
          </button>
        </div>

        {/* 見出し */}
        <div className="mt-6 text-center">
          <div className="text-token-3xl font-bold text-ink">{t("store.createTitle")}</div>
        </div>

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
    </PhoneFrame>
  );
}
