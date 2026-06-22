## Sprint 1: モノレポ基盤と共有・DB の土台

### 目的
以降の全スプリントが乗る開発基盤を立ち上げる。動くフロント画面と疎通する API、共有 Zod スキーマ、Drizzle のスキーマ・マイグレーション基盤を用意する。この段階で Stripe や認証の本実装には踏み込まないが、4層・feature-based・Schema First の骨格を確立する。

### 実装する機能
- モノレポ初期化: pnpm workspaces + Turborepo（`apps/web` `apps/api` `packages/shared` `packages/db`）
- 共有スキーマ基盤: `packages/shared` に Zod スキーマ・型・定数（金額定数 ¥100/¥300/¥500、手数料率など）の置き場
- DB 基盤: `packages/db` に Drizzle 接続（postgres-js / Supabase）と `public.*` の初期マイグレーション基盤（store / staff / tip / webhook_event の最小スキーマ）
- API 骨格: Hono サーバ（tsx 起動）、`app.ts` コンポジションルート、ヘルスチェック、4層ディレクトリ（route/service/model/repository）の雛形
- フロント骨格: Vite + React + TanStack Router + TanStack Query + Tailwind（design-tokens を config 登録）+ react-i18next（ja 辞書）+ Hono RPC クライアント

### スプリント契約（完了条件）
以下の全条件を満たした場合のみ、このスプリントは完了とする。

- [ ] リポジトリルートに `pnpm-workspace.yaml` と `turbo.json` が存在し、`apps/web` `apps/api` `packages/shared` `packages/db` の4ワークスペースが認識される
- [ ] ルートで `pnpm install` がエラーなく完了する
- [ ] `apps/api` を起動すると Hono サーバが立ち上がり、`GET /health` が 200 と JSON を返す
- [ ] `apps/api/src/app.ts` が存在し、feature を直接 import せずコンポジションルートで配線する構造になっている
- [ ] `apps/api/src/features/` 配下に route/service/model/repository の4層ディレクトリ雛形が存在する
- [ ] `packages/shared` が金額定数（100/300/500）と最低1つの Zod スキーマをエクスポートし、`apps/web` と `apps/api` の両方から import できる
- [ ] `packages/db` に Drizzle スキーマ定義（store / staff / tip / webhook_event）と drizzle-kit のマイグレーション設定が存在する
- [ ] drizzle-kit のマイグレーション生成コマンドがエラーなく実行でき、SQL マイグレーションファイルが生成される
- [ ] `apps/web` を起動するとブラウザで空のルート画面が表示され、コンソールに致命的エラーが出ない
- [ ] `apps/web` のページから Hono RPC クライアント経由で `GET /health` を呼び、結果が画面またはコンソールに表示される（フロント↔バック疎通の確認）
- [ ] Tailwind config に design-tokens.md の主要トークン（Rose #ec3a6d / Ink #1f2024 / Line #e6e7ea / 最大幅 430px）が登録され、ユーティリティとして使える
- [ ] `apps/web` に react-i18next の ja 辞書が設定され、最低1つのキー文言が i18n 経由で表示される
- [ ] ルートで `pnpm -w turbo run build`（または各 build）がエラーなく完了する
