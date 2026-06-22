import { QueryClient } from "@tanstack/react-query";

/**
 * TanStack Query のクライアント設定。
 * サーバー状態の取得・キャッシュを一元管理する（UI 状態は Zustand 側で扱う方針）。
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 疎通確認のため失敗時のリトライは1回に抑える
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
