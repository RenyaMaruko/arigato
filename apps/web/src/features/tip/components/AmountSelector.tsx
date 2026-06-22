import { TIP_AMOUNTS } from "@arigato/shared";

/**
 * 金額3択（¥100 / ¥300 / ¥500）の定額ボタン群。
 * 横3分割で並べ、選択中はローズ塗り（背景 rose・白文字・bold）、未選択は白＋ローズ枠なしのボーダーで表現する。
 * 選択状態は親（Zustand ストア）が持ち、ここは表示と onSelect 通知に専念する。
 */
type Props = {
  // 現在選択中の金額（未選択は null）
  selected: number | null;
  // 金額を選択したときの通知
  onSelect: (amount: number) => void;
};

export function AmountSelector({ selected, onSelect }: Props) {
  return (
    <div className="mt-3 flex gap-3">
      {TIP_AMOUNTS.map((amount) => {
        // 選択中かどうかで配色・太さを切り替える
        const isSelected = selected === amount;
        return (
          <button
            key={amount}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(amount)}
            className={
              isSelected
                ? "flex-1 rounded-md border-[1.5px] border-rose bg-rose py-[13px] text-center text-token-lg font-bold text-page"
                : "flex-1 rounded-md border-[1.5px] border-line bg-page py-[13px] text-center text-token-lg font-semibold text-ink"
            }
          >
            ¥{amount}
          </button>
        );
      })}
    </div>
  );
}
