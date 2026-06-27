import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { STORE_NAME_MAX_LENGTH, STORE_DESCRIPTION_MAX_LENGTH } from "@arigato/shared";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useUpdateStore } from "../hooks/useStore.js";

/**
 * 店舗プロフィール編集画面（/store/profile）。モック02に対応。
 * 店名（必須）・店舗紹介・業種を編集して保存する。金額・残高は扱わない。
 */
export function StoreProfilePage() {
  return <StoreGuard>{(store) => <StoreProfileContent store={store} />}</StoreGuard>;
}

function StoreProfileContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateMutation = useUpdateStore();

  // 既存値で初期化
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const [industry, setIndustry] = useState(store.industry ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== "" && !updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSaved(false);
    updateMutation.mutate(
      {
        storeId: store.id,
        input: {
          name: name.trim(),
          description: description.trim() === "" ? undefined : description.trim(),
          industry: industry.trim() === "" ? undefined : industry.trim(),
        },
      },
      {
        onSuccess: () => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
        },
        onError: () => setError(t("store.profileError")),
      },
    );
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る） */}
      <div className="flex flex-none items-center gap-3.5 px-5 pb-3.5 pt-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/settings" })}
          className="text-ink"
          aria-label={t("store.back")}
        >
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
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <span className="text-token-2xl font-bold text-ink">{t("store.profileTitle")}</span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col overflow-y-auto px-6 pb-6 pt-3.5">
        {/* ロゴ（プレースホルダ。アップロードは将来拡張）。右下にカメラバッジ（モック02の装飾） */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-full bg-rose-soft text-token-sm text-muted">
              {store.logoUrl ? (
                <img
                  src={store.logoUrl}
                  alt={store.name}
                  className="h-[104px] w-[104px] rounded-full object-cover"
                />
              ) : (
                "店舗ロゴ"
              )}
            </div>
            {/* カメラバッジ（白縁のローズ丸）。装飾的なため aria 非表示 */}
            <span
              className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-[2.5px] border-page bg-rose text-page"
              aria-hidden="true"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 8.5a2 2 0 0 1 2-2h2l1.2-1.8h7.6L19 6.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
            </span>
          </div>
        </div>

        {/* 店名（必須） */}
        <div className="mt-6 text-token-base text-ink-label">
          {t("store.profileNameLabel")} <span className="text-rose">{t("store.profileNameRequired")}</span>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={STORE_NAME_MAX_LENGTH}
          placeholder={t("store.profileNamePlaceholder")}
          className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
        />

        {/* 店舗紹介 */}
        <div className="mt-[18px] text-token-base text-ink-label">{t("store.profileDescriptionLabel")}</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={STORE_DESCRIPTION_MAX_LENGTH}
          placeholder={t("store.profileDescriptionPlaceholder")}
          className="mt-2 h-24 resize-none rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg leading-relaxed text-ink outline-none focus:border-rose"
        />

        {/* 業種 */}
        <div className="mt-[18px] text-token-base text-ink-label">{t("store.profileIndustryLabel")}</div>
        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          maxLength={STORE_NAME_MAX_LENGTH}
          placeholder={t("store.profileIndustryPlaceholder")}
          className="mt-2 rounded-xl border-[1.5px] border-line px-3.5 py-3.5 text-token-lg text-ink outline-none focus:border-rose"
        />

        {error && <div className="mt-4 text-center text-token-sm text-rose">{error}</div>}
        {saved && <div className="mt-4 text-center text-token-sm font-semibold text-rose">{t("store.profileSaved")}</div>}

        {/* 保存 */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-6 rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page disabled:opacity-60"
        >
          {updateMutation.isPending ? t("store.profileSaving") : t("store.profileSave")}
        </button>
      </form>

      <StoreBottomNav active="settings" />
    </PhoneFrame>
  );
}
