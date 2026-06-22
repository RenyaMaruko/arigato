# GitHub Kingdom アーキテクチャ設計書

## 概要

GitHub の活動（Commit / Pull Request / Issue 等）を RPG の経験値として扱い、

* キャラクター育成
* 村の発展
* 実績システム
* ランキング
* 将来的なギルド機能

を提供する Web サービス。

技術スタック

* Frontend: React + Vite + TypeScript
* Backend: Hono + TypeScript
* Database: PostgreSQL
* ORM: Drizzle ORM
* Validation: Zod
* State Management: Zustand
* Server State: TanStack Query
* Monorepo: Turborepo + pnpm
* Authentication: GitHub OAuth
* GitHub Integration: Webhook + API

---

# ディレクトリ構成

```text
github-rpg-kingdom/
│
├── apps/
│
│   ├── web/                                      # React フロントエンド
│   │   └── src/
│   │
│   │       ├── app/
│   │       │   ├── router.tsx                    # ルーティング定義
│   │       │   ├── providers.tsx                 # QueryClient等
│   │       │   └── layouts/                      # 共通レイアウト
│   │       │
│   │       ├── components/
│   │       │   ├── ui/                           # shadcn/ui
│   │       │   ├── common/                       # 共通コンポーネント
│   │       │   └── icons/                        # アイコン
│   │       │
│   │       ├── lib/
│   │       │   ├── api-client.ts                 # APIクライアント
│   │       │   ├── query-client.ts               # React Query設定
│   │       │   ├── auth.ts                       # 認証処理
│   │       │   └── utils.ts                      # 汎用関数
│   │       │
│   │       ├── features/                         # Feature First構成
│   │       │
│   │       │   ├── auth/                         # 認証機能
│   │       │   ├── dashboard/                    # ダッシュボード
│   │       │   ├── character/                    # キャラクター機能
│   │       │   ├── village/                      # 村機能
│   │       │   ├── achievements/                # 実績機能
│   │       │   ├── rankings/                    # ランキング
│   │       │   └── guilds/                      # 将来拡張
│   │       │
│   │       ├── assets/                          # 画像
│   │       └── types/                           # フロント専用型
│   │
│   └── api/                                     # Hono API
│       └── src/
│
│           ├── index.ts                         # エントリポイント
│           │
│           ├── middleware/                      # 認証・ログ
│           │
│           ├── infrastructure/                  # 外部システム層
│           │
│           │   ├── db/
│           │   │   ├── drizzle.ts               # DB接続
│           │   │   └── transaction.ts           # トランザクション
│           │   │
│           │   ├── github/
│           │   │   ├── github.client.ts         # Octokit生成
│           │   │   ├── github.fetcher.ts        # GitHub API取得
│           │   │   ├── github-webhook.ts        # Webhook検証
│           │   │   ├── github-oauth.ts          # OAuth処理
│           │   │   └── github.types.ts          # GitHub型
│           │   │
│           │   └── auth/
│           │
│           ├── features/
│           │
│           │   ├── auth/
│           │   ├── users/
│           │   ├── characters/
│           │   ├── villages/
│           │   ├── achievements/
│           │   ├── rankings/
│           │   └── rewards/
│           │
│           └── jobs/
│               ├── github-sync.job.ts           # 定期同期
│               ├── ranking.job.ts               # ランキング更新
│               └── achievement.job.ts           # 実績更新
│
├── packages/
│
│   ├── shared/                                  # 共通ライブラリ
│   │
│   │   ├── schemas/                             # Zod Schema
│   │   ├── types/                               # 共通型
│   │   ├── constants/                           # 定数
│   │   └── game-rules/                          # ゲーム設定
│   │
│   └── db/
│       ├── schema/                              # Drizzle Schema
│       ├── migrations/                          # Migration
│       ├── seed/                                # Seed
│       └── index.ts
│
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

# フロントエンド運用ルール

## Feature Based を徹底する

機能ごとに閉じ込める。

良い例

```text
features/
└── character/
    ├── api/
    ├── hooks/
    ├── stores/
    ├── schemas/
    ├── components/
    └── pages/
```

悪い例

```text
hooks/
components/
api/
```

機能横断で管理しない。

---

## データ取得

サーバーデータは TanStack Query を利用する。

```text
Page
 ↓
Hook
 ↓
API
 ↓
Backend
```

例

```ts
useCharacter()
↓
character.api.ts
↓
GET /characters/me
```

---

## Zustandの用途

ZustandはUI状態のみ。

管理対象

* モーダル開閉
* 表示モード
* 選択中オブジェクト

管理しない

* Character
* Village
* Ranking

これらは React Query を利用する。

---

# バックエンド運用ルール

## レイヤー構成

```text
Route
 ↓
Service
 ↓
Model
 ↓
Repository
 ↓
Database
```

---

## Route

HTTP入口のみ。

やること

* リクエスト受信
* Service呼び出し
* レスポンス返却

やらないこと

* SQL
* ゲームロジック

---

## Service

ユースケース管理。

例

```text
キャラクター取得
 ↓
経験値加算
 ↓
レベルアップ判定
 ↓
保存
```

処理の流れを管理する。

---

## Model

ゲームルールを記述する。

例

```ts
calculateLevel()

calculateReward()

determineJob()

calculateVillageGrowth()
```

Modelは純粋関数を基本とする。

DBアクセス禁止。

---

## Repository

DBアクセス専用。

Drizzle ORM の `db.execute(sql`...`)` で生 SQL を書く。

例

```ts
import { db } from "@github-rpg/db";
import { sql } from "drizzle-orm";

// 取得
const result = await db.execute(sql`
  SELECT *
  FROM characters
  WHERE id = ${id}
`);

// 保存
await db.execute(sql`
  INSERT INTO characters (user_id, level, job)
  VALUES (${userId}, ${level}, ${job})
`);

// 更新
await db.execute(sql`
  UPDATE characters
  SET level = ${newLevel}
  WHERE id = ${id}
`);
```

SQL は Repository にだけ書く。Service / Model には書かない。

---

# GitHub連携

## Webhook

リアルタイム更新。

```text
GitHub
 ↓
Webhook
 ↓
Route
 ↓
Service
 ↓
Repository
```

Push時に経験値を付与する。

---

## 定期同期

Webhook取りこぼし対策。

```text
Cron
 ↓
Job
 ↓
GitHub Fetcher
 ↓
Service
 ↓
Repository
```

夜間実行を想定。

---

# 型管理ルール

## 共通型

packages/shared に配置。

```text
packages/shared/
├── schemas/
├── types/
├── constants/
└── game-rules/
```

---

## Schema First

まずZod Schemaを書く。

```ts
export const CharacterSchema = z.object({
  id: z.string(),
  level: z.number(),
});
```

---

型は生成する。

```ts
export type Character =
  z.infer<typeof CharacterSchema>;
```

---

Frontend

```ts
import { CharacterSchema }
from "@github-rpg/shared";
```

Backend

```ts
import { CharacterSchema }
from "@github-rpg/shared";
```

同じSchemaを利用する。

---

# Feature追加ルール

新機能を追加する場合

例

```text
guilds
```

追加場所

Frontend

```text
features/guilds/
```

Backend

```text
features/guilds/
```

同じ名前で追加する。

---

# 開発原則

* Feature First
* Schema First
* Shared First
* Routeは薄く
* Serviceは指揮者
* Modelはゲームルール
* RepositoryはDB専用
* GitHub APIは Infrastructure に隔離
* Webhook + 定期同期の二重化
* 型は shared で共有

以上を本プロジェクトのアーキテクチャ標準とする。
