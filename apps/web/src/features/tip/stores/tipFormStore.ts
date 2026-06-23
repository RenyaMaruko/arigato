import { create } from "zustand";

/**
 * 投げ銭画面の UI 状態ストア（Zustand）。
 * 「選択中の金額・メッセージ・支払いシートの開閉」だけを持つ。
 * サーバー状態（店員情報・tip 記録結果）は TanStack Query 側で扱い、ここには持たない。
 * シートを開閉しても入力が保持されるよう、フォーム状態をここに集約する。
 */

type TipFormState = {
  // 選択中の金額（未選択は null）
  amount: number | null;
  // 一言メッセージ（任意・最大80文字）
  message: string;
  // 支払い方法ボトムシートの開閉
  sheetOpen: boolean;

  // 金額を選択する（任意金額の入力が無効なときは null＝送信不可）
  setAmount: (amount: number | null) => void;
  // メッセージを更新する
  setMessage: (message: string) => void;
  // シートを開く
  openSheet: () => void;
  // シートを閉じる（入力は保持したまま）
  closeSheet: () => void;
  // フォームを初期状態に戻す（「もう一度送る」で新規入力を始めるとき）
  reset: () => void;
};

// 初期状態（金額はデフォルト ¥300 をあらかじめ選択しておく＝迷わせない UX）
const initialState = {
  amount: 300 as number | null,
  message: "",
  sheetOpen: false,
};

export const useTipFormStore = create<TipFormState>((set) => ({
  ...initialState,

  setAmount: (amount) => set({ amount }),
  setMessage: (message) => set({ message }),
  openSheet: () => set({ sheetOpen: true }),
  closeSheet: () => set({ sheetOpen: false }),
  reset: () => set({ ...initialState }),
}));
