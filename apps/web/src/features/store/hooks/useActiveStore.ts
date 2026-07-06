import { useEffect, useMemo } from "react";
import { useStoreSwitcher } from "../../../lib/store-switcher.js";
import { useManagedStores, useStore } from "./useStore.js";

/**
 * 「いま管理している店」を解決するフック（§11.4・選択店解決）。
 *
 * 単一 /store/me 前提を廃し、自分が管理する店の一覧（GET /store/mine）から
 * 「選択中の店（selectedStoreId）」を解決する:
 *  - selectedStoreId が一覧に含まれていればその店。
 *  - 含まれない・未選択なら一覧の先頭（owner 優先→古参順）を既定にする。
 *  - 1件しかなければ自動でその店。
 * 解決した storeId で GET /store/:storeId を引き、店ホーム・記録・スタッフ・設定が
 * その選択店に対して正しく動くようにする。
 *
 * enabled はログイン済みのときだけ一覧を取得するための入口ガード。
 */
export function useActiveStore(enabled: boolean) {
  const managedQuery = useManagedStores(enabled);
  const { selectedStoreId, setSelectedStoreId } = useStoreSwitcher();

  const items = useMemo(() => managedQuery.data?.items ?? [], [managedQuery.data]);

  // 選択中の店を解決する（一覧に無ければ先頭を既定に）。管理する店が無ければ null
  const activeStoreId = useMemo(() => {
    if (items.length === 0) return null;
    if (selectedStoreId && items.some((i) => i.id === selectedStoreId)) {
      return selectedStoreId;
    }
    return items[0]!.id;
  }, [items, selectedStoreId]);

  // 既定に落ち着いた選択を永続する（次回以降・他画面と一致させる）。
  // selectedStoreId が一覧から外れた（閉店・権限喪失）ときも先頭へ寄せ直す。
  useEffect(() => {
    if (activeStoreId && activeStoreId !== selectedStoreId) {
      setSelectedStoreId(activeStoreId);
    }
  }, [activeStoreId, selectedStoreId, setSelectedStoreId]);

  // 解決した storeId で店プロフィールを引く（選択店スコープ）
  const storeQuery = useStore(activeStoreId ?? undefined);

  return {
    // 管理する店の一覧クエリ（表示条件・ローディング判定に使う）
    managedQuery,
    items,
    activeStoreId,
    // 選択店の店プロフィール（店ホーム・サブ画面が使う StoreProfile）
    storeQuery,
    // 管理する店が1つ以上あるか（中央ナビの表示条件）
    hasManagedStore: items.length > 0,
  };
}
