import type { ReactNode } from "react";

/**
 * スマホ枠コンポーネント（現場3者の画面共通）。
 * 端末枠の外側（#e9e9ec）の中央に、最大幅 430px・1カラムの白いコンテナを置く。
 * PC で開いても横いっぱいに広がらず、スマホアプリのように見せる（要件 2.5）。
 * 上部にステータスバー風の表示を持つ。
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    // 端末枠の外側背景・中央寄せ
    <div className="min-h-screen bg-app-bg flex justify-center font-sans text-ink">
      {/* スマホ幅のコンテナ。地から浮かせる影をかける */}
      <div className="relative flex w-full max-w-app flex-col overflow-hidden bg-page min-h-screen shadow-phone">
        {/* ステータスバー風（時刻・アイコン） */}
        <div className="flex flex-none items-center justify-between px-6 pb-1.5 pt-[15px]">
          <span className="text-token-lg font-semibold text-status">9:41</span>
          <div className="flex items-center gap-1.5 text-status">
            <span className="text-token-sm">●●●●</span>
            <span className="text-token-md">📶</span>
            <span className="relative inline-block h-3 w-6 rounded-sm border border-status">
              <span className="absolute inset-[1.5px] right-[5px] rounded-[1px] bg-status" />
            </span>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
