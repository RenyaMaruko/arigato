import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useMarkTutorialSeen } from "../../../lib/use-mark-tutorial-seen.js";

// 吹き出しの基準幅（px）。左右の見切れ防止に max-w も併用する
const BUBBLE_WIDTH = 240;
// 吹き出しと指す対象のすき間（px）
const GAP = 12;

/**
 * 初回アカウント作成チュートリアル（キー: welcome・2ステップの吹き出し）。
 * プロフィール作成が完了して店員ホームに初めて入ったとき（seenTutorials に welcome が無いとき）に
 * 1回だけ表示する。表示判定は親（StaffHomePage）が lib の shouldShowWelcomeTutorial で行う。
 *
 * 見た目はモード切替のコーチマーク（StoreModeSwitch）と同じ視覚言語に揃える。
 * スクリム＋吹き出し（しっぽ付き）で、実際のホーム上の要素を順に指す:
 *  1. 残高カードの「本人確認をする」ボタン付近（無ければ残高カードにフォールバック）
 *  2. 機能グリッドの「店舗作成」タイル
 * 指す対象が画面に無い/画面外のときは、中央にフォールバックして壊れない形にする。
 *
 * 閉じる（最後のステップで「はじめる」／スクリムタップ）と welcome を既読化する。
 * 既読化は楽観更新（me キャッシュ即時反映）＋裏で既読API（冪等・失敗は次回再表示で許容）。
 * 既読になると親の表示条件が外れて自動的にアンマウントされるため、ここでは表示状態を持たない。
 * モード切替チュートリアル（mode_switch）はこの welcome を既読にするまで出ない（2枚重ねない）。
 */
export function WelcomeTutorial() {
  const { t } = useTranslation();
  // 現在のステップ（0 → 1）
  const [step, setStep] = useState<0 | 1>(0);
  const markTutorialSeen = useMarkTutorialSeen();

  // 吹き出し本体の実測（上下どちらに置くか・高さぶんのオフセット計算に使う）
  const bubbleRef = useRef<HTMLDivElement>(null);
  // 指す対象の位置（ビューポート基準の矩形）。対象が無い/画面外のときは null（＝中央フォールバック）
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [bubbleHeight, setBubbleHeight] = useState(0);

  // 各ステップの内容と、指す対象の候補セレクタ（先頭から順に、見つかった最初のものを指す）
  const steps = [
    {
      // ステップ1: 本人確認ボタン（無ければ残高カード）を指す
      selectors: ['[data-tutorial-target="verify"]', '[data-tutorial-target="balance"]'],
      title: t("staff.welcomeTutorialStep1Title"),
      body: t("staff.welcomeTutorialStep1Body"),
      cta: t("staff.welcomeTutorialNext"),
    },
    {
      // ステップ2: 店舗作成タイルを指す
      selectors: ['[data-tutorial-target="create-store"]'],
      title: t("staff.welcomeTutorialStep2Title"),
      body: t("staff.welcomeTutorialStep2Body"),
      cta: t("staff.welcomeTutorialStart"),
    },
  ] as const;
  const current = steps[step];

  // 閉じる＝welcome を既読にする（キャッシュの楽観更新で即座に消える）
  const finish = () => markTutorialSeen("welcome");

  // 主ボタン: ステップ1は「次へ」、ステップ2は「はじめる」（閉じて既読化）
  const handlePrimary = () => {
    if (step === 0) {
      setStep(1);
    } else {
      finish();
    }
  };

  // 指す対象を実測する。スクロール・リサイズにも追従して吹き出しをその上/下に貼り付ける。
  // 依存は step のみ（selectors はレンダリングごとに新しい配列になるため、依存に入れると
  // 「実行→setRect→再レンダリング→再実行」の無限ループになる）。
  useLayoutEffect(() => {
    // 候補セレクタの先頭から、画面内に見えている最初の要素を採用（無ければ null＝中央）
    const measure = () => {
      for (const selector of steps[step].selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const r = el.getBoundingClientRect();
          // 画面外（上に隠れた/下にはみ出た）なら次の候補・最終的に中央へ
          if (r.bottom > 0 && r.top < window.innerHeight) {
            // 位置が変わっていなければ state を更新しない（同値の再セットによる再レンダリング防止）
            setRect((prev) =>
              prev &&
              prev.top === r.top &&
              prev.left === r.left &&
              prev.width === r.width &&
              prev.height === r.height
                ? prev
                : r,
            );
            return;
          }
        }
      }
      setRect(null);
    };
    measure();
    window.addEventListener("resize", measure);
    // 内側スクロール（capture）にも追従させる
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // steps は i18n 文言を含む定義で毎レンダリング再生成されるため、step だけを依存にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 吹き出しの高さを実測（上に置くときの top 計算・初回のチラ見え防止に使う）
  useLayoutEffect(() => {
    if (bubbleRef.current) {
      setBubbleHeight(bubbleRef.current.offsetHeight);
    }
  }, [step, rect]);

  // 吹き出しの位置としっぽの向き・位置を算出する。
  // ランタイムの座標（getBoundingClientRect 由来）は Tailwind クラスで表現できないため、
  // 位置指定のみ style を使う（配色・角丸・影などの見た目は全て Tailwind トークン）。
  let bubblePosition: CSSProperties;
  // しっぽの位置（吹き出し左端からの px）。中央フォールバック時は出さない
  let tailStyle: CSSProperties | null = null;
  // しっぽの向き（true: 上向き＝吹き出しは対象の下／false: 下向き＝吹き出しは対象の上）
  let tailUp = true;

  if (rect && bubbleHeight > 0) {
    // 対象の中心Xに合わせつつ、左右にはみ出さないよう画面内にクランプ
    const centerX = rect.left + rect.width / 2;
    const spaceBelow = window.innerHeight - rect.bottom;
    // 下に十分な余白があれば対象の下、無ければ上に置く
    tailUp = spaceBelow > bubbleHeight + GAP + 16;
    const top = tailUp ? rect.bottom + GAP : rect.top - GAP - bubbleHeight;
    const left = Math.max(
      16,
      Math.min(window.innerWidth - 16 - BUBBLE_WIDTH, centerX - BUBBLE_WIDTH / 2),
    );
    bubblePosition = { top, left };
    // しっぽは対象中心の真下/真上に来るよう、吹き出し左端からの相対位置で置く
    const tailLeft = Math.max(20, Math.min(BUBBLE_WIDTH - 20, centerX - left));
    tailStyle = { left: tailLeft };
  } else if (rect) {
    // 対象は在るが吹き出し未計測（初回描画）: 一旦画面外に置いて計測しチラ見えを防ぐ
    bubblePosition = { top: -9999, left: -9999 };
  } else {
    // フォールバック: 指す対象が無い/画面外 → 画面中央に吹き出しだけ出す（しっぽ無し）
    bubblePosition = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* 背面スクリム（タップで閉じる＝見たことにする） */}
      <button
        type="button"
        aria-label={t("staff.welcomeTutorialStart")}
        onClick={finish}
        className="absolute inset-0 cursor-default bg-scrim"
      />

      {/* 吹き出し本体（実際のホーム要素を指す・モード切替コーチマークと同じ質感） */}
      <div
        ref={bubbleRef}
        style={bubblePosition}
        className="absolute w-[240px] max-w-[calc(100%-32px)] rounded-xl bg-page p-4 text-center shadow-phone"
      >
        <div className="text-token-base font-bold text-ink">{current.title}</div>
        <div className="mt-1.5 text-token-sm leading-relaxed text-ink-sub">{current.body}</div>

        {/* ステップの現在地（2ステップの小さな目印） */}
        <div className="mt-2.5 flex items-center justify-center gap-1.5" aria-hidden="true">
          <span className={`h-1.5 w-1.5 rounded-pill ${step === 0 ? "bg-rose" : "bg-line"}`} />
          <span className={`h-1.5 w-1.5 rounded-pill ${step === 1 ? "bg-rose" : "bg-line"}`} />
        </div>

        {/* 主ボタン（次へ → はじめる） */}
        <button
          type="button"
          onClick={handlePrimary}
          className="mt-2.5 w-full rounded-xl bg-rose py-2.5 text-token-sm font-bold text-page"
        >
          {current.cta}
        </button>

        {/* 吹き出しのしっぽ（指す対象を向く。中央フォールバック時は出さない） */}
        {tailStyle && (
          <div
            style={tailStyle}
            className={`absolute h-3 w-3 -translate-x-1/2 rotate-45 bg-page ${
              tailUp ? "-top-1.5" : "-bottom-1.5"
            }`}
          />
        )}
      </div>
    </div>
  );
}
