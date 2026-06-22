import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

/**
 * API サーバの起動エントリ。
 * コンポジションルートで配線したアプリを Node サーバとして待ち受ける。
 * DATABASE_URL が未設定でも起動・/health は動く（DB 接続は遅延生成のため）。
 */

// 待ち受けポート（環境変数 PORT、未設定なら 8787）
const port = Number(process.env.PORT ?? 8787);

const app = createApp();

// Node サーバとして起動
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`arigato-api は http://localhost:${info.port} で起動しました`);
});
