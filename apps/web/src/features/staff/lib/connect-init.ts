/**
 * 埋め込みオンボーディング初期化の「実行すべきか」判定（useConnectOnboarding の中核ロジック・純粋関数）。
 *
 * Stripe SDK や API に依存しない純粋関数として切り出し、単体テスト可能にする
 * （connect.ts は @stripe/connect-js や API クライアントを import するため、テストはこの薄い純粋関数で担保する）。
 *
 * コールド読み込み（/staff/identity 直リンク・/me 未キャッシュ）では enabled が初回 false で、
 * データ到着後に true へ変わる。この false→true 遷移を取りこぼさず、かつ一度初期化したら
 * 再レンダー・再 enabled でも作り直さない（多重生成防止）ことを保証する。
 *
 * - enabled が true かつ未初期化（alreadyInitialized=false）のときだけ初期化する。
 * - enabled が false、または初期化済みのときは初期化しない。
 */
export function shouldInitConnectOnboarding(
  enabled: boolean,
  alreadyInitialized: boolean,
): boolean {
  return enabled && !alreadyInitialized;
}
