import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Providers } from "./app/providers.js";
import { router } from "./app/router.js";
// i18n を初期化（副作用 import）
import "./i18n/index.js";
import "./index.css";

/**
 * フロントのエントリポイント。
 * i18n を初期化し、Query プロバイダの中でルーターを描画する。
 */
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("#root が見つかりません");
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
