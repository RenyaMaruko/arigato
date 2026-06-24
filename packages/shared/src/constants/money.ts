/**
 * 投げ銭に関する金額・手数料の定数。
 * 金額計算（Model 層の純粋関数）やフロントの定額ボタンが参照する単一の真実の源泉。
 * 通貨は日本円（最小単位＝1円）で扱う。
 *
 * 料率モデル（手取り型）:
 *  - お客さまは投げ銭額（額面）を「ぴったり」支払う（上乗せなし・高く見せない）。`customer_total = amount`。
 *  - 手数料は合計 15%（= 決済料 + 運営手数料）を「店員側から差し引く」。店員手取りは約 85%。
 *  - 運営手数料（application_fee）は「15% − Stripe 決済料率」で算出する。
 *    Direct charge では Stripe の処理手数料が Connected Account（店員）側から引かれるため、
 *    運営が application_fee を 15% 丸ごと取ると店員手取りが 85% を下回る。決済料分を差し引くことで
 *    店員手取り約 85% を成立させる。
 *  - 例: ¥1,000 → お客さま ¥1,000 / Stripe 約 ¥36 / 運営 約 ¥114 / 店員 ¥850。
 */

// 定額投げ銭ボタンの金額候補（お客さまが支払う額面・円。店員手取りはこの約85%）。3列×2行のグリッドで表示する。
export const TIP_AMOUNTS = [100, 300, 500, 1000, 3000, 5000] as const;

// 定額金額のユニオン型
export type TipAmount = (typeof TIP_AMOUNTS)[number];

// 手数料合計率（決済料 + 運営手数料）。額面のこの割合を店員側から差し引く（店員手取り = 1 − これ）。
export const TOTAL_FEE_RATE = 0.15;

// Stripe の決済料率（日本のカード一律 3.6% 想定。実料率は本番の Stripe 設定で最終確認する）。
// Direct charge では Connected Account（店員）側から引かれるため、application_fee の算出時に差し引く。
export const STRIPE_FEE_RATE = 0.036;

// 店員さんの手取り率（約85%）。額面 × これ＝店員手取り。手数料合計15%を額面から差し引いた残り。
export const STAFF_TAKE_RATE = 1 - TOTAL_FEE_RATE; // = 0.85

// 運営手数料率（application_fee の算出に使う・約11.4%）。
// ＝ 手数料合計15% − Stripe 決済料3.6%。Direct charge で Stripe 料が店員側から引かれる分を差し引き、
// 運営の取り分をこの率に抑えることで店員手取り約85%を成立させる。
export const PLATFORM_FEE_RATE = TOTAL_FEE_RATE - STRIPE_FEE_RATE; // = 0.114

// 通貨コード（Stripe へ渡す通貨。日本円）
export const CURRENCY = "jpy" as const;

// 受け付ける投げ銭の最小・最大金額（円）。バリデーションの境界に使う。
export const MIN_TIP_AMOUNT = 100;
export const MAX_TIP_AMOUNT = 50000;

// メッセージの最大文字数（任意入力・80文字まで）
export const MESSAGE_MAX_LENGTH = 80;
