import type { Stamp } from "@arigato/shared";

/**
 * スタンプ4種（heart / smile / thumb / flower）と表示絵文字の対応。
 * 投げ銭画面の選択肢・完了画面の再掲で共通利用する。
 */
export const STAMPS: { key: Stamp; emoji: string; label: string }[] = [
  { key: "heart", emoji: "❤️", label: "ハート" },
  { key: "smile", emoji: "🙂", label: "スマイル" },
  { key: "thumb", emoji: "👍", label: "いいね" },
  { key: "flower", emoji: "🌸", label: "お花" },
];

// スタンプキー → 絵文字の早見表
export const STAMP_EMOJI: Record<Stamp, string> = {
  heart: "❤️",
  smile: "🙂",
  thumb: "👍",
  flower: "🌸",
};
