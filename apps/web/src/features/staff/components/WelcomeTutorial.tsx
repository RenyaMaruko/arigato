import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMarkTutorialSeen } from "../../../lib/use-mark-tutorial-seen.js";

/**
 * 初回アカウント作成チュートリアル（キー: welcome・2ステップ）。
 * プロフィール作成が完了して店員ホームに初めて入ったとき（seenTutorials に welcome が無いとき）に
 * 1回だけ表示する。表示判定は親（StaffHomePage）が lib の shouldShowWelcomeTutorial で行う。
 *
 * ステップ:
 *  1. 本人確認をすると送金できる（ホームの「本人確認をする」ボタンへの導線を案内）
 *  2. 店舗を管理する人は店舗を作成できる（作成後は中央の「店舗管理」切替で行き来できることを案内）
 *
 * 閉じる（「はじめる」またはスクリムタップ）と welcome を既読化する。
 * 既読化は楽観更新（me キャッシュ即時反映）＋裏で既読API（冪等・失敗は次回再表示で許容）。
 * 既読になると親の表示条件が外れて自動的にアンマウントされるため、ここでは表示状態を持たない。
 * モード切替チュートリアル（mode_switch）はこの welcome を既読にするまで出ない（2枚重ねない）。
 */
export function WelcomeTutorial() {
  const { t } = useTranslation();
  // 現在のステップ（1 → 2）
  const [step, setStep] = useState<1 | 2>(1);
  const markTutorialSeen = useMarkTutorialSeen();

  // 閉じる＝welcome を既読にする（キャッシュの楽観更新で即座に消える）
  const finish = () => markTutorialSeen("welcome");

  // 主ボタン: ステップ1は「次へ」、ステップ2は「はじめる」（閉じて既読化）
  const handlePrimary = () => {
    if (step === 1) {
      setStep(2);
    } else {
      finish();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      {/* 背面スクリム（タップで閉じる＝見たことにする） */}
      <button
        type="button"
        aria-label={t("staff.welcomeTutorialStart")}
        onClick={finish}
        className="absolute inset-0 cursor-default bg-scrim"
      />

      {/* カード本体（アプリ幅の中で中央・ステップ内容＋ドット＋主ボタン） */}
      <div className="relative w-full max-w-[300px] rounded-2xl bg-page px-6 pb-6 pt-7 text-center shadow-phone">
        {/* ステップのアイコン（ローズ淡色の丸地にローズのアイコン） */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-soft text-rose">
          {step === 1 ? <ShieldCheckIcon /> : <StoreIcon />}
        </div>

        {/* タイトル・本文（やわらかい ですます調） */}
        <div className="mt-4 text-token-xl font-bold leading-snug text-ink">
          {step === 1
            ? t("staff.welcomeTutorialStep1Title")
            : t("staff.welcomeTutorialStep2Title")}
        </div>
        <div className="mt-2 text-token-sm leading-relaxed text-ink-sub">
          {step === 1
            ? t("staff.welcomeTutorialStep1Body")
            : t("staff.welcomeTutorialStep2Body")}
        </div>

        {/* ステップドット（現在地をローズで強調） */}
        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          <span
            className={`h-1.5 w-1.5 rounded-pill ${step === 1 ? "bg-rose" : "bg-line"}`}
          />
          <span
            className={`h-1.5 w-1.5 rounded-pill ${step === 2 ? "bg-rose" : "bg-line"}`}
          />
        </div>

        {/* 主ボタン（次へ → はじめる） */}
        <button
          type="button"
          onClick={handlePrimary}
          className="mt-4 w-full rounded-xl bg-rose py-3 text-token-md font-bold text-page"
        >
          {step === 1 ? t("staff.welcomeTutorialNext") : t("staff.welcomeTutorialStart")}
        </button>
      </div>
    </div>
  );
}

/** 本人確認（盾＋チェック）アイコン。ステップ1（本人確認で送金できる）に使う。 */
function ShieldCheckIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3 5 5.8v5.2c0 4.4 3 7.8 7 9.2 4-1.4 7-4.8 7-9.2V5.8L12 3z" />
      <path d="m9 11.8 2.2 2.2L15.4 9.7" />
    </svg>
  );
}

/** 店（建物）アイコン。ステップ2（店舗の作成・管理の案内）に使う。 */
function StoreIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 9.5 5.2 5h13.6L20 9.5" />
      <path d="M4 9.5V20h16V9.5" />
      <path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
