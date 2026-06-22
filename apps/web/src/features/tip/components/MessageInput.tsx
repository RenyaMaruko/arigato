import { MESSAGE_MAX_LENGTH } from "@arigato/shared";

/**
 * 任意メッセージの入力欄（最大80文字）。
 * 右下に「入力文字数/80」のカウンタを出し、maxLength で80文字を超えて入力できないようにする。
 * 入力値は親（Zustand ストア）が保持し、ここは表示と onChange 通知に専念する。
 */
type Props = {
  // 現在のメッセージ
  value: string;
  // メッセージ変更の通知
  onChange: (value: string) => void;
  // プレースホルダ文言
  placeholder: string;
};

export function MessageInput({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative mt-[10px]">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={placeholder}
        className="h-[74px] w-full resize-none rounded-lg border-[1.5px] border-line px-[14px] py-[13px] text-token-md leading-[1.6] text-ink placeholder:text-muted-soft focus:border-rose focus:outline-none"
      />
      {/* 右下の文字数カウンタ（入力に応じて更新） */}
      <span className="absolute bottom-[11px] right-[13px] text-token-xs text-muted-soft">
        {value.length}/{MESSAGE_MAX_LENGTH}
      </span>
    </div>
  );
}
