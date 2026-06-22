# （仮称）Arigato アーキテクチャ設計書

## 概要

接客現場で、お客さまが気に入った店員さん個人に、QRコードからその場で少額の「ありがとう（投げ銭）」を、メッセージとともに送れる Web サービス。

* お客さまの投げ銭（QR→ブラウザ即決済）
* 店員さん個人への直接分配（運営はお金に触れない）
* 感謝データの構造化蓄積
* 「金額は本人のみ」のプライバシー原則
* 店による導入承認・スタッフ管理

を提供する。

技術スタック

* Frontend: React + Vite + TypeScript
* Backend: Hono + TypeScript
* Database: Supabase (PostgreSQL)
* ORM: Drizzle ORM
* Validation: Zod
* State Management: Zustand
* Server State: TanStack Query
* Routing: TanStack Router
* Monorepo: Turborepo + pnpm
* Authentication: Supabase Auth（Google / メール）
* Payment Integration: Stripe Connect + Webhook
* i18n: react-i18next（日 / 英）

---

# ディレクトリ構成

```text
arigato/
│
├── apps/
│
│   ├── web/                                      # React フロントエンド
│   │   └── src/
│   │
│   │       ├── app/
│   │       │   ├── router.tsx                    # ルーティング定義（TanStack Router）
│   │       │   ├── providers.tsx                 # QueryClient等
│   │       │   └── layouts/                      # 共通レイアウト
│   │       │
│   │       ├── components/
│   │       │   ├── ui/                           # 共通UIプリミティブ
│   │       │   ├── common/                       # 共通コンポーネント
│   │       │   └── icons/                        # アイコン
│   │       │
│   │       ├── lib/
│   │       │   ├── api-client.ts                 # APIクライアント（Hono RPC `hc`）
│   │       │   ├── query-client.ts               # TanStack Query設定
│   │       │   ├── auth.ts                       # Supabase Auth処理
│   │       │   └── analytics.ts                  # GA4イベント
│   │       │
│   │       ├── features/                         # Feature First構成
│   │       │
│   │       │   ├── tip/                          # 投げ銭（お客さま向け）
│   │       │   ├── staff/                        # 店員さん機能
│   │       │   └── store/                        # 店機能
│   │       │
│   │       ├── i18n/                             # 言語辞書（ja / en）
│   │       ├── assets/                           # 画像
│   │       └── types/                            # フロント専用型
│   │
│   └── api/                                      # Hono API
│       └── src/
│
│           ├── app.ts                            # コンポジションルート（依存配線・ルートマウント）
│           │
│           ├── middleware/                       # Supabase JWT検証・ログ
│           │
│           ├── infrastructure/                   # 外部システム層
│           │
│           │   ├── db/
│           │   │   ├── drizzle.ts                # DB接続
│           │   │   └── transaction.ts            # トランザクション
│           │   │
│           │   ├── stripe/
│           │   │   ├── stripe.client.ts          # Stripe SDK生成
│           │   │   ├── stripe-connect.ts         # Connectオンボーディング・分配
│           │   │   ├── stripe-webhook.ts         # Webhook署名検証
│           │   │   └── stripe.types.ts           # Stripe型
│           │   │
│           │   └── auth/
│           │       └── supabase-jwt.ts           # Supabase JWT検証（jose）
│           │
│           ├── features/
│           │
│           │   ├── tip/                          # 投げ銭・決済・メッセージ
│           │   ├── staff/                        # 店員アカウント・QR・受取履歴・保留残高
│           │   └── store/                        # 店承認・スタッフ管理・感謝の可視化
│           │
│           └── jobs/
│               └── stripe-reconcile.job.ts       # Stripe突合（Webhook取りこぼし対策）
│
├── packages/
│
│   ├── shared/                                   # 共通ライブラリ
│   │
│   │   ├── schemas/                              # Zod Schema
│   │   ├── types/                                # 共通型
│   │   └── constants/                            # 定数（金額・手数料率など）
│   │
│   └── db/
│       ├── schema/                               # Drizzle Schema（public.*）
│       ├── migrations/                           # Migration
│       ├── seed/                                 # Seed
│       └── index.ts
│
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

# フロントエンド運用ルール

## 対応端末・画面方針

現場で使う3者（お客さま `tip` / 店員さん `staff` / 店 `store`）の画面は**スマホサイズのみ**で作る。PC でも画面いっぱいに広げず、**モバイル幅で中央に1カラム固定**する（Web だがスマホアプリのように見せる）。PC デザインを作るのは**運営の管理画面（admin）だけ**。

詳細は要件定義書 2.5「対応端末・画面方針」を正とする。

---

## Feature Based を徹底する

機能ごとに閉じ込める。

良い例

```text
features/
└── tip/
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
useStaffTips()
↓
staff.api.ts
↓
GET /staff/me/tips
```

---

## Zustandの用途

ZustandはUI状態のみ。

管理対象

* モーダル開閉
* 表示モード
* 選択中の金額ボタン

管理しない

* Tip
* Staff
* Store

これらは TanStack Query を利用する。

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
* 金額計算・業務ロジック

---

## Service

ユースケース管理。

例

```text
店員取得
 ↓
投げ銭の金額計算
 ↓
保留残高 or 着金の判定
 ↓
保存
```

処理の流れを管理する。

**アクセス制御も Service 層で守る**。「金額は本人のみ閲覧可」は Service 層のルールとして実装し、RLS と二重管理にしない。

---

## Model

業務ルールを記述する。

例

```ts
calculateCustomerTotal()   // 投げ銭額 + 上乗せ手数料 = お客さま支払額

calculatePlatformFee()     // 運営の取り分（手数料）

calculateStaffAmount()     // 店員さんに届く満額

canPayout()                // 本人確認の状態から着金可否を判定
```

Modelは純粋関数を基本とする。

DBアクセス禁止。

金額計算は Model に集約し、Vitest のテスト対象にする。

---

## Repository

DBアクセス専用。

Drizzle ORM の `db.execute(sql`...`)` で生 SQL を書く。

例

```ts
import { db } from "@arigato/db";
import { sql } from "drizzle-orm";

// 取得
const result = await db.execute(sql`
  SELECT *
  FROM staff
  WHERE id = ${id}
`);

// 保存
await db.execute(sql`
  INSERT INTO tips (staff_id, amount, message, status)
  VALUES (${staffId}, ${amount}, ${message}, ${status})
`);

// 更新
await db.execute(sql`
  UPDATE tips
  SET status = ${newStatus}
  WHERE id = ${id}
`);
```

SQL は Repository にだけ書く。Service / Model には書かない。

---

# Stripe連携

外部API（Stripe / Supabase 等）は `infrastructure/` に隔離する。feature ではない。

## Webhook

決済確定はブラウザでなく Webhook を正とする。

```text
Stripe
 ↓
Webhook
 ↓
Route
 ↓
Service
 ↓
Repository
```

* **raw body で受ける**：署名検証は生のリクエストボディが必要。自動 JSON パースを通さないルートを用意する。
* **冪等性を持たせる**：処理済みイベントIDを記録し、重複は無視する（二重記録の防止）。

---

## 分配（Connect）

お金は運営の残高を一度も経由させない。免許を持つのは Stripe。運営は application_fee（手数料）だけ受け取る。

* 課金タイプは **Direct charge を基本**（◎）／ Destination charge は可（○）。
* **Separate charges and transfers は使わない**（⚠️ 「預かって送る」＝資金移動の論点に踏み込むため）。

---

## 本人確認は後ろ倒し（保留残高）

本人確認・口座登録が未完了でも投げ銭は受け付け、**未着金の保留残高**として記録する。

```text
Connectオンボーディング完了
 ↓
Webhook
 ↓
Service
 ↓
保留残高 → 着金可能へ遷移
```

保留残高の保持・着金条件は Service / Model 層で明示管理する（要件定義書 3.5「体験を登録の前に」）。

---

## 定期同期

Webhook取りこぼし対策。

```text
Cron
 ↓
Job
 ↓
Stripe突合
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
└── constants/
```

---

## Schema First

まずZod Schemaを書く。

```ts
export const TipSchema = z.object({
  id: z.string(),
  amount: z.number(),
  message: z.string().optional(),
});
```

---

型は生成する。

```ts
export type Tip =
  z.infer<typeof TipSchema>;
```

---

Frontend

```ts
import { TipSchema }
from "@arigato/shared";
```

Backend

```ts
import { TipSchema }
from "@arigato/shared";
```

同じSchemaを利用する。

---

# Feature追加ルール

新機能を追加する場合

例

```text
notifications
```

追加場所

Frontend

```text
features/notifications/
```

Backend

```text
features/notifications/
```

同じ名前で追加する。

feature 同士は直接 import しない。依存はコンポジションルート（`app.ts`）で配線する。

---

# 開発原則

* Feature First
* Schema First
* Shared First
* Routeは薄く
* Serviceは指揮者（アクセス制御もここ）
* Modelは金額計算（純粋関数・テスト対象）
* RepositoryはDB専用
* Stripe / Supabase は Infrastructure に隔離
* Webhookを正・定期同期で二重化
* 運営の残高にお金を乗せない（資金移動を回避）
* 金額は本人のみ閲覧可
* 型は shared で共有

以上を本プロジェクトのアーキテクチャ標準とする。
