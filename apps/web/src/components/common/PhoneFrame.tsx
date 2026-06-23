import type { ReactNode } from "react";

/**
 * スマホ枠コンポーネント（現場3者の画面共通）。
 * 端末枠の外側（#e9e9ec）の中央に、最大幅 430px・1カラムの白いコンテナを置く。
 * PC で開いても横いっぱいに広がらず、スマホアプリのように見せる（要件 2.5）。
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    // 端末枠の外側背景・中央寄せ
    <div className="min-h-screen bg-app-bg flex justify-center font-sans text-ink">
      {/* スマホ幅のコンテナ。地から浮かせる影をかける */}
      <div className="relative flex w-full max-w-app flex-col overflow-hidden bg-page min-h-screen shadow-phone">
        {children}
      </div>
    </div>
  );
}
