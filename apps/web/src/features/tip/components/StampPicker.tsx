import type { Stamp } from "@arigato/shared";
import { STAMPS } from "./stamps.js";

/**
 * 感情スタンプ4種（heart / smile / thumb / flower）の選択ボタン群。
 * 円形ボタンで横並びにし、選択中は淡いローズ背景（rose-soft）+ ローズ枠（2px）で表現する。
 * 同じスタンプを再タップすると解除できる（親の toggle に委譲）。
 */
type Props = {
  // 現在選択中のスタンプ（未選択は null）
  selected: Stamp | null;
  // スタンプを選択/解除したときの通知
  onToggle: (stamp: Stamp) => void;
};

export function StampPicker({ selected, onToggle }: Props) {
  return (
    <div className="mt-3 flex gap-[14px]">
      {STAMPS.map(({ key, emoji, label }) => {
        // 選択中かどうかで背景・枠を切り替える
        const isSelected = selected === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={isSelected}
            onClick={() => onToggle(key)}
            className={
              isSelected
                ? "flex h-12 w-12 items-center justify-center rounded-full border-2 border-rose bg-rose-soft text-token-3xl"
                : "flex h-12 w-12 items-center justify-center rounded-full border-2 border-transparent bg-stamp-bg text-token-3xl"
            }
          >
            {emoji}
          </button>
        );
      })}
    </div>
  );
}
