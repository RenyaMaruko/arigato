import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import type { StoreProfile } from "@arigato/shared";
import { PhoneFrame } from "../../../components/common/PhoneFrame.js";
import { StoreBottomNav } from "../components/StoreBottomNav.js";
import { StoreGuard } from "../components/StoreGuard.js";
import { useStoreStaffDetail } from "../hooks/useStore.js";
import { downloadQrAsImage } from "../../../lib/qr-image.js";

/**
 * スタッフのQR表示画面（/store/staff/:staffId/qr・店スコープ）。
 * スタッフ詳細の「QRを表示」から来る。そのスタッフの投げ銭QR（店員本人のQRと同じ /tip/:membershipId）を
 * 表示・印刷する（店がレジ横などに印刷して置く用途）。
 * 体裁は店員側のQR画面（StaffStoreDetailPage）と同じトーン（角ローズ枠・中央ハート・印刷時はQRと名前のみ）。
 * 金額・受取件数は一切表示しない（店はお金に触れない）。
 */
export function StoreStaffQrPage() {
  return <StoreGuard>{(store) => <StoreStaffQrContent store={store} />}</StoreGuard>;
}

function StoreStaffQrContent({ store }: { store: StoreProfile }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // URL から対象スタッフ ID を受け取る
  const { staffId } = useParams({ from: "/store/staff/$staffId/qr" });
  // スタッフ詳細（在籍中のみ・店スコープ。membershipId / tipUrl を含む）
  const detailQuery = useStoreStaffDetail(store.id, staffId);
  const detail = detailQuery.data;

  // 印刷を実行する（print:hidden により QR と名前のみが出るレイアウト）
  const handlePrint = () => {
    window.print();
  };

  return (
    <PhoneFrame>
      {/* ヘッダー（戻る＝スタッフ詳細へ・タイトル。印刷時は隠す） */}
      <div className="flex flex-none items-center justify-between px-[22px] pb-1.5 pt-2 print:hidden">
        <button
          type="button"
          onClick={() => navigate({ to: "/store/staff/$staffId", params: { staffId } })}
          aria-label={t("store.back")}
          className="flex h-6 w-6 items-center justify-center text-ink"
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
        <span className="text-token-2xl font-bold text-ink">{t("store.staffQrTitle")}</span>
        {/* レイアウト対称のためのスペーサー */}
        <span className="h-6 w-6" />
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-[26px] pb-7 pt-5">
        {detailQuery.isLoading ? (
          // 取得中（在籍中スタッフの詳細を読み込み中）
          <div className="mt-10 text-center text-token-sm text-muted">{t("store.loading")}</div>
        ) : detailQuery.isError || !detail ? (
          // 取得失敗（脱退済み・他店・存在しない等）はエラー表示＋一覧へ戻る導線
          <div className="mt-10 flex flex-col items-center gap-4 text-center">
            <p className="text-token-sm text-muted">{t("store.staffDetailLoadError")}</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/store/staff" })}
              className="rounded-xl bg-rose px-6 py-3 text-token-md font-bold text-page"
            >
              {t("store.staffTitle")}
            </button>
          </div>
        ) : (
          <>
            {/* 見出し（誰のQRかを併記する）。印刷にはQRと名前だけ出すため print では隠す */}
            <div className="mt-3.5 text-center text-token-lg font-bold text-ink print:hidden">
              {t("store.staffQrHeading")}
            </div>
            <div className="mt-1 text-center text-token-sm text-rose print:hidden">
              {t("store.staffQrSub", { name: detail.displayName })}
            </div>

            {/* QR 本体（印刷対象）。コーナーブラケットで装飾する（店員側QR画面と同じ体裁） */}
            <div className="mt-7 flex justify-center">
              <div className="relative p-[22px]" data-testid="store-staff-qr">
                {/* 四隅のローズ色ブラケット */}
                <span className="absolute left-0 top-0 h-[34px] w-[34px] rounded-tl-lg border-l-4 border-t-4 border-rose print:hidden" />
                <span className="absolute right-0 top-0 h-[34px] w-[34px] rounded-tr-lg border-r-4 border-t-4 border-rose print:hidden" />
                <span className="absolute bottom-0 left-0 h-[34px] w-[34px] rounded-bl-lg border-b-4 border-l-4 border-rose print:hidden" />
                <span className="absolute bottom-0 right-0 h-[34px] w-[34px] rounded-br-lg border-b-4 border-r-4 border-rose print:hidden" />
                {/* QR コード（印刷を想定して十分な解像度で描画する SVG）。中央にハートの目印を重ねる */}
                <div className="relative">
                  <QRCodeSVG
                    value={detail.tipUrl}
                    size={220}
                    level="H"
                    marginSize={0}
                    title={detail.displayName}
                  />
                  {/* 中央のハート（読み取りに影響しないよう誤り訂正レベルを H にしている） */}
                  <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-page text-token-2xl">
                    ❤️
                  </span>
                </div>
              </div>
            </div>

            {/* スタッフ名・店名（印刷時の案内・最小限） */}
            <div className="mt-5 text-center">
              <span className="text-token-xl font-bold text-ink">{detail.displayName}</span>
              <span className="text-token-md text-ink"> {t("store.san")}</span>
            </div>
            <div className="mt-1 text-center text-token-sm text-ink-sub">{store.name}</div>

            {/* 案内（画面のみ・印刷では隠す） */}
            <div className="mt-5 text-center text-token-sm text-muted print:hidden">
              {t("store.staffQrNote")}
            </div>

            {/* QR が指す URL（確認用・画面のみ） */}
            <div className="mt-4 break-all rounded-xl border-[1.5px] border-line bg-surface-subtle px-4 py-3 text-center print:hidden">
              <div className="text-token-xs text-ink-sub">{t("store.staffQrUrlLabel")}</div>
              <div className="mt-1 text-token-sm text-ink">{detail.tipUrl}</div>
            </div>

            {/* 印刷・画像保存ボタン（画面のみ。店が印刷して置く／画像で共有する用途） */}
            <div className="mt-auto flex flex-col gap-3 pt-8 print:hidden">
              <button
                type="button"
                onClick={handlePrint}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("store.staffQrPrint")}
              </button>
              {/* 画像として保存（PNGダウンロード。写真保存・コンビニ印刷・共有用） */}
              <button
                type="button"
                onClick={async () => {
                  const svg = document.querySelector<SVGSVGElement>(
                    '[data-testid="store-staff-qr"] svg',
                  );
                  if (!svg) return;
                  await downloadQrAsImage(
                    svg,
                    `${detail.displayName} ${t("store.san")}`,
                    store.name,
                    `qr-${store.name}-${detail.displayName}`,
                  );
                }}
                className="rounded-xl bg-rose py-4 text-center text-token-lg font-bold text-page"
              >
                {t("store.staffQrSaveImage")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 下部ボトムナビ（現在地＝スタッフ。印刷時は隠す） */}
      <div className="print:hidden">
        <StoreBottomNav active="staff" />
      </div>
    </PhoneFrame>
  );
}
