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
      {/* スマホ幅のコンテナ。高さは固定せず min-h-[100dvh] だけ確保し、
          本文は通常のドキュメントスクロール（body スクロール）に流す方式。
          iOS 26 の Safari は下部のフローティングバーが「ページに重なるオーバーレイ」で、
          ページ自体がスクロールしないとバーが畳まれず、下端の要素がバーの裏に隠れて
          操作できなくなる（100dvh/svh 固定＋内部スクロールでは実機で解決不能だった）。
          普通のサイトと同じくドキュメントをスクロールさせればバーが畳まれるため、
          overflow-hidden・高さ固定・セーフエリアのパディングは持たない。
          ボトムナビは各ナビ側で fixed 配置し、min-h + flex-col は
          コンテンツが短い画面でも mt-auto の下寄せボタンが機能するよう維持する。 */}
      <div className="relative flex w-full max-w-app flex-col bg-page min-h-[100dvh] shadow-phone">
        {children}
      </div>
    </div>
  );
}
