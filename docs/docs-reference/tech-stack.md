# 技術スタック

Vite(SPA) + React + Hono を、**Zod と Hono RPC で型を貫通させた**、TypeScript 一気通貫の SPA 構成。
状態は「ローカル / サーバー / グローバル」で分担し、設計はフロント・バックとも feature-based。
認証は **GitHub OAuth**、DB は **Drizzle ORM** で PostgreSQL に接続。

---

## フロントエンド

| レイヤー | 採用技術 |
| --- | --- |
| 言語 | TypeScript |
| UIライブラリ | React |
| ビルド基盤 | Vite（SPA構成・Next.jsは使わない） |
| ルーティング | TanStack Router |
| コンポーネント設計 | Bulletproof React（feature-based） |
| サーバー状態 | TanStack Query |
| クライアント状態 | Zustand |
| スタイル | Tailwind CSS（インラインスタイル `style={{}}` は使わない。値はデザイントークンに従う） |
| UIコンポーネント | shadcn/ui |
| フォーム / 検証 | React Hook Form + Zod |

## バックエンド

| レイヤー | 採用技術 |
| --- | --- |
| ランタイム | Node.js |
| フレームワーク | Hono |
| 構成 | feature-based（フロントと同じ思想） |
| ORM | Drizzle ORM |
| 検証 | @hono/zod-validator（Zodをフロントと共有） |
| API通信 | Hono RPC（`hc`）で型安全に接続 |
| ミドルウェア | cors / logger など公式を必要な分だけ |

### バックエンドレイヤー構成

```text
Route        ← HTTP入口のみ（リクエスト受信・レスポンス返却）
 ↓
Service      ← ユースケース管理（処理の流れを指揮）
 ↓
Model        ← ゲームルール（純粋関数・DBアクセス禁止）
 ↓
Repository   ← DB操作専用（Drizzle ORM はここだけ）
 ↓
Database
```

## 認証

| やること | 使うもの |
| --- | --- |
| ログイン | GitHub OAuth |
| GitHub API アクセス | OAuth で取得したアクセストークン |
| JWT 検証 | Hono ミドルウェア |

## データベース

| レイヤー | 採用技術 |
| --- | --- |
| DB | PostgreSQL |
| ORM | Drizzle ORM |
| スキーマ管理 | packages/db に集約（Drizzle Schema / Migration / Seed） |

```ts
// DBアクセス：Drizzle ORM で生 SQL を書く
import { db } from "@github-rpg/db";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`
  SELECT *
  FROM characters
  WHERE id = ${id}
`);
```

> Drizzle ORM はクエリビルダ（`db.select().from()`）も使えるが、本プロジェクトでは **`db.execute(sql\`...\`)` による生 SQL** を基本とする。
> SQL の自由度・透明性を優先し、複雑なクエリも素直に書く。Drizzle はスキーマ管理・マイグレーション・型生成の基盤として活用する。

## GitHub データ取得

| 方式 | 用途 |
| --- | --- |
| **GitHub GraphQL API** | 活動サマリー（全期間）・草カレンダー・人口（collaborators）の取得 |
| **GitHub REST API** | リポジトリ列挙・最近の活動（Events API） |

### GraphQL API を採用する理由

- 1 リクエストで必要なデータをまとめて取得（コミット数、PR数、レビュー数、Issue数、草カレンダー、リポジトリ別活動）
- REST API だと同じ情報に 5〜6 リクエスト必要
- Rate Limit 的にも有利

### 同期戦略

同期（GitHub API を叩いて DB を更新する処理）は、以下の **2 つのタイミングのみ**で実行する。
定期的な自動同期や Webhook は行わない。

| タイミング | 処理 |
| --- | --- |
| 初回ログイン | DB に活動データが無いとき、自動で1回だけ全データを取得 → DB 保存 |
| 「更新」ボタン | ユーザーが手動で押したとき、GitHub から再取得 → DB 更新 |
| 通常のページ表示 | **DB から即表示**（GitHub API は叩かない） |

> **最重要方針：画面表示時は GitHub ではなく自分の DB を見る。**
> GitHub API で毎回取得するのではなく、自分の DB に蓄積する設計を基本とする。

> **Webhook について**：「コミットした瞬間に自動で成長する」リアルタイム更新（GitHub App + Webhook）は
> 現状スコープ外（採用しない）。同期はあくまで初回ログインと更新ボタンの手動のみ。
> 将来的にリアルタイム性が必要になった場合の追加候補として残す。

## デプロイ構成

| 対象 | デプロイ先 | 理由 |
| --- | --- | --- |
| フロントエンド (Vite SPA) | **Cloudflare Pages** | 静的配信で高速・無料 |
| バックエンド (Hono) | **Render / Fly.io / Railway** | Node.js サーバーとして素直に動く |
| データベース | **Supabase / その他 PostgreSQL ホスティング** | PostgreSQL ホスティング |

```
Cloudflare Pages          Render 等              PostgreSQL
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│  Vite SPA   │─hc──>│  Hono API    │─ORM─>│  PostgreSQL   │
│  (静的配信)  │      │  (Node.js)   │      │  (Drizzle)   │
└─────────────┘      └──────────────┘      └──────────────┘
                            │
                      GitHub OAuth
                      (JWT 検証)
```

- Hono は実行環境を選ばない設計のため、将来 AWS 等への移行も低コスト
- 大規模化した段階でコンテナ基盤（AWS ECS 等）への移行を検討

## 周辺（規模が出てきたら）

| 用途 | 採用技術 |
| --- | --- |
| モノレポ | pnpm workspace / Turborepo |
| テスト | Vitest + Testing Library（単体） / Playwright（E2E） |
| リンタ・整形 | ESLint + Prettier（or Biome） |
| CI/CD | GitHub Actions |
| インフラ | Docker + Cloudflare / AWS |
| 監視 | Sentry |

---

## 全体をつなぐ要（TypeScript統一の旨味）

このスタックの肝は、**フロントとバックを型で貫通させている**こと。

- **Zodスキーマを共有** … 同じ検証ルールをフロント（React Hook Form）とバック（@hono/zod-validator）の両方で使う
- **Hono RPC（`hc`）** … HTTPの壁で消える型を繋ぎ直し、APIの入出力にバックの型が自動で乗る
- **Drizzle ORM** … スキーマから TypeScript の型が自動生成され、DB層も型安全
- これを最大限活かすため、**モノレポ**でフロント・バック・共通の型を1リポジトリに置く

## 状態管理の使い分け

| 状態の種類 | 使う道具 |
| --- | --- |
| ローカル状態（コンポーネント内） | useState / useReducer |
| サーバー状態（API由来） | TanStack Query |
| クライアントのグローバル状態 | Zustand |

> 「グローバル状態」は意外と少ない。まずローカルと TanStack Query で片付くか考え、必要になったら Zustand を足す。
> Zustand は UI 状態のみ（モーダル開閉、表示モード等）。Character / Village / Ranking 等のサーバーデータは TanStack Query で管理。

## データの流れ（ログイン例）

```
[入力]       React Hook Form + Zod で検証
   ↓ 検証OKの値
[認証]        GitHub OAuth でログイン → JWT を取得
   ↓ 以降のAPIリクエストにJWTを付与
[通信の管理]  TanStack Query (useQuery / useMutation)
   ↓ その中身で
[通信の実行]  hc → Hono API を型安全に呼ぶ（JWT付き）
   ↓ バック側
[サーバー]    Hono が JWT を検証 → @hono/zod-validator(同じZod) で入力検証
   ↓
[DB]         Drizzle ORM で PostgreSQL を操作
   ↓ 返ってきた型付きデータ
[保存]       必要なら Zustand にUI状態を格納
```

各道具のレイヤーの違い（混同しやすい3つ）:

| 道具 | 担当 | タイミング |
| --- | --- | --- |
| React Hook Form | 入力管理・検証 | 送信**前** |
| TanStack Query | 通信の管理（状態・キャッシュ・再試行） | 送信の**仕切り** |
| `hc`（Hono RPC） | 通信の実行（型安全なfetch） | 送信の**中身** |

---

## ディレクトリ構成（feature-based モノレポ）

※ 詳細は [Architecture.md](Architecture.md) を参照。

### 全体構成

```
github-rpg-kingdom/
├── apps/
│   ├── web/        ← フロントエンド (Vite + React)
│   └── api/        ← バックエンド (Hono)
├── packages/
│   ├── shared/     ← 共有 Zod スキーマ・型定義・定数・ゲームルール
│   └── db/         ← Drizzle Schema / Migration / Seed
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 設計原則

- フロント・バックとも feature-based
- feature 同士は直接 import しない（依存の向きを一方向に保つ）
- Zod スキーマは shared パッケージで共有し、フロント・バック両方で使用
- 最初から Route / Service / Model / Repository の4層に分離する
- GitHub API は infrastructure に隔離（feature ではない）
- Webhook + 定期同期の二重化

---

## 主要な設計判断と理由

- **Next.jsは使わない** … ページ遷移をSPA並みにキビキビさせたい。App Router の「遷移ごとにサーバーを待つ」挙動を避ける。SEOは不要（ログイン後の体験がメイン）。
- **Drizzle ORM を使う** … TypeScript との型統合が優秀。スキーマから型が自動生成される。軽量で Hono との相性が良い。生 SQL も書ける柔軟性がある。
- **GitHub OAuth を直接使用** … GitHub 活動データの取得がサービスの核なので、GitHub との直接連携を優先。
- **GitHub GraphQL API をメインに使用** … 1 リクエストで必要データをまとめて取得。REST より効率的で Rate Limit にも有利。
- **活動データは日別集計で保存** … 柔軟性と容量のバランス。後からレベル計算式の変更や月別・リポジトリ別分析が可能。
- **過去実績をレベルに全反映** … GitHub 人生の可視化がサービスの核。SNS バイラル効果を最大化。
- **レベルは対数曲線** … 初心者にも成長感があり、ベテランとの差が絶望的にならない。
- **村は自動成長（操作なし）** … 「GitHub 活動 = 村の成長」の直感的な因果関係を維持。ゲームではなく可視化。
- **フロントとバックを分離デプロイ** … SPA は Cloudflare Pages で無料高速配信。バックは用途に合わせてスケール。
- **状態は性質で分ける** … 「1つのライブラリで全部」はやらない。Redux一強の時代の反省。
- **設計は前後とも feature-based** … 機能単位でまとめ、「その機能が消えたら一緒に消えるか」で配置を判断。

---

## 適性・注意点

- **SEOが必要なサービスには不向き** … SPA構成のため、検索流入が生命線のメディア/LPには弱い。本サービスはログイン後体験がメインのため問題なし。
- **型貫通はモノレポ前提** … Zod共有も Hono RPC も、フロント・バックが1リポジトリにあって初めて真価が出る。

---

## 開発ロードマップ

### Phase1 (MVP)

- GitHub OAuth ログイン
- GitHub GraphQL API による過去データ取得
- キャラクター生成・表示（レベル、職業、ステータス）
- 村の静的表示（過去データから自動生成）
- SNS シェア機能

### Phase2: 村の成長・ゲーム性強化

- 村の動的成長システム
- 連続活動ボーナス

> 同期は引き続き「初回ログイン + 更新ボタン」の手動方式とする。
> GitHub App + Webhook によるリアルタイム自動成長は現状スコープ外（将来の追加候補）。

### Phase3: ソーシャル機能

- ランキング
- フレンド機能
- ギルド
- レイドボス

---

## 一言まとめ

> Vite(SPA) + React + Hono を、Zod と Hono RPC で型を貫通させた、TypeScript一気通貫のSPA構成。
> 状態は「ローカル=useState / サーバー=TanStack Query / グローバル=Zustand」で分担、設計は前後とも feature-based。
> 認証は GitHub OAuth、DB は Drizzle ORM で PostgreSQL に接続。
> GitHub データは GraphQL API で取得し自分の DB に蓄積。画面表示は DB 参照。デプロイはフロント=Cloudflare Pages、バック=Render等で分離。
