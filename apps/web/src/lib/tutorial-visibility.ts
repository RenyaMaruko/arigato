/**
 * チュートリアルの表示判定（純粋関数）。
 * 既読状態は me API（GET /staff/me）の seenTutorials（DB の user_tutorial 由来・アカウント紐づけ）を
 * 正とする。localStorage は使わない（プライベートモード・別端末での再表示を防ぐため）。
 *
 * 横断ルール:
 *  - seenTutorials が未ロード（undefined）の間はどのチュートリアルも表示しない
 *    （既読者への一瞬のチラ見え防止）。
 *  - welcome と mode_switch が同時に条件を満たす場合は welcome を優先し、2枚重ねない。
 *
 * 共有コンポーネント（components/common/StoreModeSwitch）と staff feature の両方から使うため、
 * feature ではなく横断の lib に置く（feature 同士の直接 import を避ける）。
 */

/**
 * 初回アカウント作成チュートリアル（welcome）を表示すべきか。
 * 店員ホームに初めて入ったとき（既読一覧に welcome が無いとき）に出す。
 * seenTutorials 未ロード（undefined）の間は出さない（チラ見え防止）。
 */
export function shouldShowWelcomeTutorial(
  seenTutorials: readonly string[] | undefined,
): boolean {
  // 既読情報のロード完了までは表示しない
  if (!seenTutorials) return false;
  return !seenTutorials.includes("welcome");
}

/**
 * 中央ナビ切替チュートリアル（mode_switch のコーチマーク）を表示すべきか。
 *  - seenTutorials 未ロード（undefined）の間は出さない（チラ見え防止）
 *  - 選択シートが開いている間は出さない（重なり防止）
 *  - 既読（mode_switch）なら二度と出さない
 *  - 店員モードでは welcome 未読の間は出さない（welcome を優先し、2枚重ねない。
 *    welcome を閉じると seenTutorials が即時更新され、続けてこちらが出る）
 */
export function shouldShowModeSwitchTutorial(params: {
  // いまのモード（staff: 店員 / store: 店舗管理）
  mode: "staff" | "store";
  // me API の既読一覧（未ロードは undefined）
  seenTutorials: readonly string[] | undefined;
  // 複数店の選択シートが開いているか
  sheetOpen: boolean;
}): boolean {
  const { mode, seenTutorials, sheetOpen } = params;
  // 既読情報のロード完了までは表示しない
  if (!seenTutorials) return false;
  // シート表示中は重ねない
  if (sheetOpen) return false;
  // 既読なら出さない
  if (seenTutorials.includes("mode_switch")) return false;
  // welcome 優先（店員モードのみ。店舗管理モードでは welcome は出ないため制限しない）
  if (mode === "staff" && !seenTutorials.includes("welcome")) return false;
  return true;
}
