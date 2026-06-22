import { useTranslation } from "react-i18next";
import { TIP_AMOUNTS } from "@arigato/shared";
import { useHealth } from "./useHealth.js";

/**
 * ルート画面（Sprint 1 の疎通確認用ホーム）。
 * i18n 経由の文言表示と、Hono RPC で叩いた GET /health の結果表示を行う。
 * スタイルは Tailwind のトークンユーティリティのみで記述する（インラインスタイル禁止）。
 */
export function HomePage() {
  const { t } = useTranslation();
  // バックとの疎通結果を取得
  const { data, isLoading, isError } = useHealth();

  // 疎通状態の表示文言を決める
  let healthLabel = t("health.checking");
  if (isError) healthLabel = t("health.error");
  else if (data) healthLabel = t("health.ok");

  return (
    // 端末枠の外側背景。中央にスマホ幅の白いコンテナを置く
    <div className="min-h-screen bg-app-bg flex justify-center font-sans text-ink">
      <div className="w-full max-w-app bg-page min-h-screen shadow-phone px-6 py-10">
        {/* アプリ名・タグライン（i18n 経由） */}
        <h1 className="text-2xl font-bold text-ink">{t("app.title")}</h1>
        <p className="mt-1 text-sm text-ink-sub">{t("app.tagline")}</p>

        {/* 金額定数の確認表示（shared から import） */}
        <div className="mt-8">
          <p className="text-base text-ink-label font-bold">金額</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {TIP_AMOUNTS.map((amount) => (
              <div
                key={amount}
                className="rounded-md border-[1.5px] border-line py-3 text-center text-[15px] font-semibold text-ink"
              >
                ¥{amount}
              </div>
            ))}
          </div>
        </div>

        {/* API 疎通結果の表示 */}
        <div className="mt-8 rounded-xl border-[1.5px] border-line p-4">
          <p className="text-sm text-ink-sub">API ステータス</p>
          <p
            className={
              isError
                ? "mt-1 text-base font-bold text-rose"
                : "mt-1 text-base font-bold text-ink"
            }
          >
            {healthLabel}
          </p>
          {/* 疎通成功時はサービス名・時刻も表示 */}
          {data && !isLoading && (
            <p className="mt-2 text-xs text-muted">
              {data.service} / {data.timestamp}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
