import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/query-client.js";

/**
 * アプリ全体のプロバイダ配線。
 * サーバー状態の TanStack Query を全画面に供給する。
 */
export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
