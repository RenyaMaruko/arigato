import type { ReactNode } from "react";

/**
 * スマホ枠コンポーネント（現場3者の画面共通）。
 * 端末枠の外側（#e9e9ec）の中央に、最大幅 430px・1カラムの白いコンテナを置く。
 * PC で開いても横いっぱいに広がらず、スマホアプリのように見せる（要件 2.5）。
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    // 端末枠の外側背景・中央寄せ（外側はビューポート最低高さを確保して中央に置く）
    <div className="min-h-screen bg-app-bg flex justify-center font-sans text-ink">
      {/* スマホ幅のコンテナ。高さをビューポートに固定（h-[100dvh]）し、
          中身は内部スクロール・ボトムナビは flex-none で画面下に貼り付く。
          dvh はモバイルのブラウザバー伸縮に追従させるため（min-h-screen だと縦に伸びて
          ナビが画面外へ流れてしまう）。地から浮かせる影は維持する。 */}
      <div className="relative flex w-full max-w-app flex-col overflow-hidden bg-page h-[100dvh] shadow-phone">
        {children}
      </div>
    </div>
  );
}
