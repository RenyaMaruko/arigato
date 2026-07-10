import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 店舗モード切替の UI 状態（Zustand・localStorage 永続。§11.4）。
 * 複数店舗を管理する人向けに「いま管理している店（selectedStoreId）」を保持する。
 *
 * サーバー状態（管理店の一覧そのもの）は TanStack Query で扱い、ここには持たない。
 * ここは「どの店を選んでいるか」という UI 状態だけを永続する。
 * feature 同士の直接 import を避けるため、横断的に使うこの状態は lib に置く（店側・店員側の両ナビから使う）。
 *
 * 補足: 中央ナビ切替のチュートリアル既読は localStorage 管理をやめ、DB（user_tutorial・
 * me API の seenTutorials）へ移行した（プライベートモード・別端末での再表示を防ぐため）。
 * 旧キー（switchTutorialSeen）は読まなくなるだけで掃除は不要。
 */
type StoreSwitcherState = {
  // いま管理モードで開いている店の id（未選択・不明は null＝一覧の先頭を既定にする）
  selectedStoreId: string | null;
  // 管理モードで開く店を選ぶ（中央ナビの選択・店作成直後の既定設定に使う）
  setSelectedStoreId: (storeId: string | null) => void;
};

export const useStoreSwitcher = create<StoreSwitcherState>()(
  persist(
    (set) => ({
      selectedStoreId: null,
      setSelectedStoreId: (storeId) => set({ selectedStoreId: storeId }),
    }),
    {
      // localStorage のキー（他機能と衝突しない名前空間）
      name: "arigato.storeSwitcher",
    },
  ),
);
