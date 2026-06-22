# 技術スタック テンプレート

このプロジェクトで採用している技術スタック・アーキテクチャ・構成の一覧。
**他プロジェクトを同じ構成で立ち上げるためのリファレンス**として使う。
（バージョンは本プロジェクト時点のもの。新規採用時は最新の安定版を確認すること）

## 全体像

- **モノレポ**（pnpm workspaces + Turborepo）にフロント・バック・共有パッケージを同居
- **フロントとバックを分離デプロイ**（静的SPA + Nodeサーバー + PostgreSQL）
- **フロント・バックともに feature-based** 構成、バックは 4 層分離
- **Zod スキーマを共有パッケージ**に置き、フロント・バックで型と検証を共有
- **型安全な API 通信**（Hono RPC `hc` クライアント）

## 基盤・共通

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| パッケージマネージャ | pnpm（workspaces） | 8.15.9 | 依存管理・モノレポのワークスペース |
| モノレポ管理 | Turborepo | ^2.0 | タスク実行・ビルドのオーケストレーション/キャッシュ |
| 言語 | TypeScript | ^5.4 | 全パッケージ共通 |
| テスト | Vitest | ^2.0 | ユニットテスト（Vite と統合） |

## フロントエンド（apps/web）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| ビルド/開発サーバー | Vite | ^5.3 | バンドル・HMR |
| UI ライブラリ | React | ^18.3 | UI 構築 |
| ルーティング | TanStack Router | ^1.34 | 型安全なルーティング・データロード |
| サーバー状態/データ取得 | TanStack Query | ^5.40 | フェッチ・キャッシュ・無効化 |
| クライアント/UI 状態 | Zustand | ^4.5 | UI 状態のみ（サーバー状態は Query 側） |
| スタイリング | Tailwind CSS（+ PostCSS / autoprefixer） | ^3.4 | デザイントークンを config に登録して使用。インラインスタイル禁止 |
| API クライアント | Hono RPC（`hc`） | hono ^4 | バックの型を import して型安全に呼ぶ |

> 状態管理は「性質で分ける」：サーバー状態 = TanStack Query、UI 状態 = Zustand。1つのライブラリで全部やらない。

## バックエンド（apps/api）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| Web フレームワーク | Hono（Node.js / `@hono/node-server`） | ^4 | ルーティング・HTTP |
| バリデーション | Zod（+ `@hono/zod-validator`） | zod ^3.23 | リクエスト検証・スキーマ |
| ORM | Drizzle ORM | ^0.31 | DB アクセス。Repository 層で `db.execute(sql\`...\`)` の生 SQL |
| 認証（トークン） | jose | ^5.3 | JWT（HS256, 7日）発行・検証 |
| 暗号化 | Node `crypto`（AES-256-GCM） | 標準 | 外部アクセストークンを暗号化して DB 保存 |
| 実行 | tsx | ^4.10 | 開発・本番ともに TS ソースを直接起動 |

> 本番も `node dist` ではなく **tsx でソース起動**（ワークスペースを TS ソース参照する構成のため）。`tsx` は dependencies に置く。

## 共有パッケージ（packages/shared）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| スキーマ/型 | Zod | ^3.23 | フロント・バック共有の Zod スキーマと型（`z.infer`） |

## データベース（packages/db）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| DB | PostgreSQL | - | リレーショナルDB |
| ORM | Drizzle ORM | ^0.31 | スキーマ定義・クエリ |
| ドライバ | postgres（postgres-js） | ^3.4 | DB 接続 |
| マイグレーション | drizzle-kit | ^0.22 | スキーマ生成・マイグレーション（`drizzle-kit generate` / 適用は migrate スクリプト） |

## 認証方式

- **プロバイダ認証は外部 OAuth**（本プロジェクトは GitHub OAuth）。パスワードは自前で持たない
- ログインセッションは **JWT（jose, HS256, 有効期限7日）**
- 外部 API のアクセストークンは **AES-256-GCM で暗号化**して DB 保存
- OAuth の state 検証を行う

## ホスティング / デプロイ

| 対象 | 採用 | 補足 |
| --- | --- | --- |
| フロント（静的SPA） | Cloudflare Workers（静的アセット配信） | `wrangler.jsonc` で `assets` 配信 + SPA フォールバック |
| バック（Node API） | Railway | Build/Start/pre-deploy(migrate) をダッシュボード or `railway.json` で定義。tsx 起動 |
| データベース | Railway PostgreSQL（または Neon） | Neon はサーバーレスで自動停止しない無料枠。Railway は同居で管理一本化 |
| アクセス解析 | Google Analytics（GA4 / gtag） | 計測IDは `VITE_GA_ID` 環境変数。未設定なら無効。SPAのためルート変更時に手動 page_view |

## アーキテクチャ規約

- **Feature-based 構成**（フロント・バック共通）。「その機能が消えたら一緒に消えるか」で配置を判断
- **バックは 4 層分離**：`Route → Service → Model（純粋関数）→ Repository（生SQL）`
  - Route: HTTP 入口（薄く）／Service: ユースケース橋渡し／Model: ゲーム/業務ルールの純粋関数（DBアクセスなし・テスト対象）／Repository: DB アクセスのみ
- **feature 同士は直接 import しない**。依存はコンポジションルート（`app.ts`）でコールバック注入して配線
- **外部 API（GitHub 等）は infrastructure/ に隔離**（feature ではない）
- **生 SQL は Repository 層のみ**（Drizzle の `db.execute(sql\`...\`)`）
- **Zod スキーマは packages/shared** に置きフロント・バックで共有
- **スタイルは Tailwind ユーティリティのみ**。色・余白等はトークン化（config 登録）、ハードコード/インラインスタイル禁止（動的値を除く）
- コメントは日本語。関数/コンポーネント頭に役割コメント、処理の節目に一言コメント

## リポジトリ構成

```
.
├── apps/
│   ├── web/                 # フロント（Vite + React）
│   │   └── src/
│   │       ├── app/         # ルーター等のアプリ配線
│   │       ├── components/  # 横断的な共有UI
│   │       ├── features/    # 機能単位（pages/components/hooks/api/utils）
│   │       └── lib/         # 横断ユーティリティ（api-client, auth, analytics 等）
│   └── api/                 # バック（Hono / Node）
│       └── src/
│           ├── app.ts          # コンポジションルート（依存配線・ルートマウント）
│           ├── features/       # 機能単位（route/service/model/repository）
│           ├── infrastructure/ # 外部API・認証・暗号化など
│           └── middleware/     # 認証ミドルウェア等
├── packages/
│   ├── shared/              # Zod スキーマ・共有型・定数
│   └── db/                  # Drizzle スキーマ・マイグレーション・接続
├── turbo.json              # タスクパイプライン
└── pnpm-workspace.yaml     # ワークスペース定義
```

## 新規プロジェクトでの立ち上げ手順（概要）

1. pnpm + Turborepo でモノレポ初期化、`apps/web` `apps/api` `packages/shared` `packages/db` を作成
2. shared に Zod スキーマ、db に Drizzle スキーマ＋マイグレーション基盤
3. api を Hono で 4 層構成、shared/db を workspace 依存に
4. web を Vite+React+TanStack Router/Query+Zustand+Tailwind、API は Hono RPC で型安全に
5. 認証（OAuth + JWT + トークン暗号化）、CORS・環境変数の整備
6. デプロイ：フロント=Cloudflare Workers、バック=Railway、DB=Railway/Neon（手順は `docs/deployment.md` 参照）
7. 解析：GA4（`VITE_GA_ID`）

> 各レイヤーの詳細ルールは `docs/Architecture.md`、デザイン規約は `DESIGN.md` / `docs/design-tokens.md`、デプロイは `docs/deployment.md` を参照。
