/**
 * 投げ銭に関する金額・手数料の定数。
 * 金額計算（Model 層の純粋関数）やフロントの定額ボタンが参照する単一の真実の源泉。
 * 通貨は日本円（最小単位＝1円）で扱う。
 */

// 定額投げ銭ボタンの金額候補（店員さんに届く満額・円）
export const TIP_AMOUNTS = [100, 300, 500] as const;

// 定額金額のユニオン型（¥100 / ¥300 / ¥500）
export type TipAmount = (typeof TIP_AMOUNTS)[number];

// 運営手数料率（application_fee の算出に使う）。お客さま側に上乗せする想定。
export const PLATFORM_FEE_RATE = 0.1;

// 通貨コード（Stripe へ渡す通貨。日本円）
export const CURRENCY = "jpy" as const;

// 受け付ける投げ銭の最小・最大金額（円）。バリデーションの境界に使う。
export const MIN_TIP_AMOUNT = 100;
export const MAX_TIP_AMOUNT = 50000;

// メッセージの最大文字数（任意入力・80文字まで）
export const MESSAGE_MAX_LENGTH = 80;
