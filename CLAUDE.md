# Git

- コミット時は `/git-commit` スキルを使用すること
- コミットメッセージは日本語で書くこと

# Comments

コード内のコメントは以下のルールに従って書くこと。

- **コメントは全て日本語で書く**（英語で書かない）
- **関数・コンポーネントの頭には役割を説明するコメントを書く**
  - 何をするものか、何のためにあるかが読んで分かる程度の粒度（数行程度）
  - 必要なら「なぜそうしているか」も書いてよい
  - ただし `@param` / `@returns` を網羅するガチガチの JSDoc 形式にはしない。自然な日本語の説明文でよい
- **処理の途中にも節目ごとに一言コメントを書く**
  - コードの流れが日本語で追えるように、処理のまとまりごとに短いコメントを添える
  - 一言で十分。冗長にしない

例:

```ts
/**
 * 投げ銭の金額選択コンポーネント。
 * 定額ボタン（¥100/¥300/¥500）を表示し、選択中の金額を強調する。
 */
export function AmountSelector({ amounts, selected, onSelect }: Props) {
  // お客さま支払額 = 投げ銭額 + 上乗せ手数料
  const total = selected + calculatePlatformFee(selected);
  ...
}
```

# Tech Stack

技術選定・ライブラリ選定に関わる判断時は `/docs/tech-stack.md` を必ず読み、定義された技術スタックに従うこと。記載のない技術を勝手に導入しない。

# Architecture

コードの実装・設計に関わる変更時は `/docs/architecture.md` を必ず読み、そのアーキテクチャルールに従うこと。

主要な原則:
- Feature-based 構成（フロント・バック共通）
- バックエンドは Route → Service → Model → Repository の4層分離
- 外部API（Stripe / Supabase）は infrastructure に隔離（feature ではない）
- Drizzle ORM の `db.execute(sql`...`)` で生 SQL を書く（Repository 層のみ）
- Zod スキーマは packages/shared で共有
- feature 同士は直接 import しない

# Design

UI/デザインに関わるコード変更時は `/docs/design-tokens.md` を必ず読み、そのトークン値に従うこと。

# Agent Quartet Harness

## エージェント・オーケストレーション

このハーネスは4つのサブエージェントによるパイプラインで開発を進める。

### パイプライン

```
@planner → @generator → @designer → @evaluator
                ↑                        │
                └── 不合格時のフィードバック ──┘
```

### 各エージェントの役割

| エージェント | 役割 | 入力 | 出力 |
|---|---|---|---|
| `@planner` | 仕様策定 | ユーザーの短いプロンプト | `/docs/spec.md`, `/docs/sprints/sprint-N.md` |
| `@generator` | 機能実装 | スプリント契約 | 動作するコード + 完了報告 |
| `@designer` | UI仕上げ | デザイントークン + 参考画像 + Generator の出力 | スタイル適用済みコード + 完了報告 |
| `@evaluator` | QAテスト | スプリント契約 + Playwright MCP | 合格 or 不合格（修正指示付き） |

### スプリント実行手順

各スプリントは以下の順序で実行する。**順序を飛ばしてはならない。**

#### 1. 計画フェーズ（初回のみ）
- `@planner` にプロダクトの概要を渡す
- `/docs/spec.md` と `/docs/sprints/sprint-N.md` が生成される
- ユーザーが確認・承認してから次へ進む

#### 2. 実装フェーズ
- `@generator` に対象スプリント番号を指示する
- Generator は `/docs/sprints/sprint-N.md` の契約条件を全て満たすコードを書く
- UIは機能的に必要な最低限でよい（Designer が磨く）

#### 3. デザインフェーズ
- `@designer` に対象スプリント番号を指示する
- Designer は以下を読み込んでUIを仕上げる:
  - `/docs/design-tokens.md` — デザイントークン
  - `/docs/design-references/` — 参考画像
  - Generator の完了報告
- **機能を壊してはならない**

#### 4. 評価フェーズ
- `@evaluator` に対象スプリント番号を指示する
- Evaluator は Playwright MCP で実際にアプリを操作してテストする
- 判定基準:
  - スプリント契約の全条件を満たしているか
  - デザイン4基準（デザインの質、オリジナリティ、クラフト、機能性）が閾値以上か
  - エッジケースで壊れないか

#### 5. フィードバックループ（不合格時）
- Evaluator が不合格を出した場合、修正指示に従って該当エージェントに戻す:
  - **機能の不具合** → `@generator` に戻す
  - **デザインの問題** → `@designer` に戻す
- 修正後、再度 `@evaluator` で評価する
- **合格するまでこのループを繰り返す**
- 合格したら次のスプリントへ進む

### ファイル構成

```
/docs/
├── spec.md                    # 製品仕様書（Planner が生成）
├── design-tokens.md           # デザイントークン（ユーザーが用意）
├── design-references/         # 参考画像（ユーザーが用意）
│   └── *.png / *.jpg
└── sprints/
    ├── sprint-1.md            # Sprint 1 計画と契約
    ├── sprint-2.md            # Sprint 2 計画と契約
    └── ...
```

### ルール

- スプリントは必ず番号順に実行する。Sprint 2 を Sprint 1 より先に実行してはならない
- Evaluator が合格を出すまで次のスプリントに進んではならない
- 各エージェントは自分の責務範囲外の作業をしてはならない:
  - Planner は実装詳細に踏み込まない
  - Generator は仕様変更をしない
  - Designer は機能追加・ロジック変更をしない
  - Evaluator は自分でコードを修正しない
- デザイントークンと参考画像が `/docs/` に存在しない場合、Designer フェーズの前にユーザーに用意を依頼する