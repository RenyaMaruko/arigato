import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite の設定。
 * React プラグインを有効化する。開発サーバはデフォルトポート（5173）で起動する。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
