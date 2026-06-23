import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TIP_AMOUNTS, MIN_TIP_AMOUNT, MAX_TIP_AMOUNT } from "@arigato/shared";

/**
 * 金額選択。定額ボタン（¥100 / ¥300 / ¥500）に加えて「その他の金額」の自由入力を持つ。
 * 定額選択中はそのボタンをローズ塗りで強調。「その他」を選ぶと数値入力欄が開き、
 * ¥100〜¥50,000 の範囲で任意金額を入力できる（範囲外・空は無効＝親に null を通知し送信不可にする）。
 * 選択状態（金額）は親が持ち、ここは表示と onSelect 通知、および「その他」入力モードのローカル状態を担う。
 */
type Props = {
  // 現在選択中の金額（未選択・無効入力は null）
  selected: number | null;
  // 金額を選択／入力したときの通知（無効入力時は null）
  onSelect: (amount: number | null) => void;
};

// 入力文字列を検証し、範囲内の整数なら数値・それ以外は null を返す
function parseCustomAmount(text: string): number | null {
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isInteger(n)) return null;
  if (n < MIN_TIP_AMOUNT || n > MAX_TIP_AMOUNT) return null;
  return n;
}

// プリセット金額かどうか
function isPreset(amount: number): boolean {
  return (TIP_AMOUNTS as readonly number[]).includes(amount);
}

export function AmountSelector({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  // 「その他」入力モードか（初期選択がプリセットに無い値なら custom 扱い）
  const [customMode, setCustomMode] = useState(selected != null && !isPreset(selected));
  // その他入力欄の生テキスト（数字のみ）
  const [customText, setCustomText] = useState(
    selected != null && !isPreset(selected) ? String(selected) : "",
  );

  // 定額ボタンを選ぶ（その他モードは解除）
  const selectPreset = (amount: number) => {
    setCustomMode(false);
    setCustomText("");
    onSelect(amount);
  };

  // 「その他」に切り替える（現在の入力値で金額を確定。無効なら null）
  const enterCustom = () => {
    setCustomMode(true);
    onSelect(parseCustomAmount(customText));
  };

  // その他入力の変更（数字以外は除去して検証）
  const onCustomChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setCustomText(digits);
    onSelect(parseCustomAmount(digits));
  };

  // 範囲外・無効の入力中か（ヒント表示用）
  const customInvalid = customMode && customText !== "" && parseCustomAmount(customText) === null;

  const presetClass = (isSelected: boolean) =>
    isSelected
      ? "rounded-md border-[1.5px] border-rose bg-rose py-[13px] text-center text-token-lg font-bold text-page"
      : "rounded-md border-[1.5px] border-line bg-page py-[13px] text-center text-token-lg font-semibold text-ink";

  return (
    <div className="mt-3">
      {/* 定額の金額候補（3列×2行のグリッド） */}
      <div className="grid grid-cols-3 gap-3">
        {TIP_AMOUNTS.map((amount) => {
          const isSelected = !customMode && selected === amount;
          return (
            <button
              key={amount}
              type="button"
              aria-pressed={isSelected}
              onClick={() => selectPreset(amount)}
              className={presetClass(isSelected)}
            >
              ¥{amount.toLocaleString()}
            </button>
          );
        })}
      </div>

      {/* その他の金額（自由入力） */}
      <button
        type="button"
        aria-pressed={customMode}
        onClick={enterCustom}
        className={
          customMode
            ? "mt-3 w-full rounded-md border-[1.5px] border-rose bg-rose-soft py-[13px] text-center text-token-md font-bold text-rose"
            : "mt-3 w-full rounded-md border-[1.5px] border-line bg-page py-[13px] text-center text-token-md font-semibold text-ink"
        }
      >
        {t("tip.otherAmount")}
      </button>

      {/* その他モードのときだけ数値入力欄を開く */}
      {customMode && (
        <div className="mt-3">
          <div className="flex items-center rounded-xl border-[1.5px] border-line bg-page px-4 py-[13px]">
            <span className="mr-1 text-token-lg font-bold text-ink">¥</span>
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={customText}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder={t("tip.customAmountPlaceholder")}
              className="w-full bg-transparent text-token-lg font-bold text-ink outline-none placeholder:font-normal placeholder:text-muted"
            />
          </div>
          {/* 範囲ヒント（無効入力中はローズで警告） */}
          <div
            className={
              customInvalid ? "mt-2 text-token-sm text-rose" : "mt-2 text-token-sm text-muted"
            }
          >
            {t("tip.amountRange")}
          </div>
        </div>
      )}
    </div>
  );
}
