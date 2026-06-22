# （仮称）Arigato 技術スタック

リアル投げ銭サービスの技術スタック・アーキテクチャ・構成の一覧。
他プロジェクト立ち上げ時のリファレンスとしても使う。
（バージョンは目安。新規採用時は最新の安定版を確認すること）

## 全体像

- **モノレポ**（pnpm workspaces + Turborepo）にフロント・バック・共有パッケージを同居
- **フロントとバックを分離デプロイ**（静的SPA + Nodeサーバー + PostgreSQL）
- **フロント・バックともに feature-based** 構成、バックは 4 層分離
- **Zod スキーマを共有パッケージ**に置き、フロント・バックで型と検証を共有
- **型安全な API 通信**（Hono RPC `hc` クライアント）
- **認証・DB は Supabase に集約**、ORM は Drizzle、決済は Stripe を `infrastructure/` に隔離

## 登場人物と認証

| 利用者 | 認証 | 補足 |
| --- | --- | --- |
| お客さま（投げる人） | なし | QR→ブラウザで即決済。アプリ不要・登録不要が絶対要件 |
| 店員さん（受け取る人） | Supabase Auth（Google / メール） | 受け取り口座の本人確認は Stripe Connect のオンボーディングが担う |
| 店（承認・管理） | Supabase Auth（Google / メール） | お金には触れない。導入承認とスタッフ管理のみ |

## 基盤・共通

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| パッケージマネージャ | pnpm（workspaces） | 8.x | 依存管理・モノレポのワークスペース |
| モノレポ管理 | Turborepo | ^2.0 | タスク実行・ビルドのオーケストレーション/キャッシュ |
| 言語 | TypeScript | ^5.4 | 全パッケージ共通 |
| テスト | Vitest | ^2.0 | ユニットテスト（特に Model 層の金額計算を対象に） |

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
| 国際化（i18n） | react-i18next | ^14 | 日英対応。お客さま決済ページは必須、管理画面は当面日本語のみ可 |
| 決済UI | Stripe（Checkout または Elements） | - | カード情報を自前サーバーに通さない。Apple Pay / Google Pay を最優先表示 |

> 状態管理は「性質で分ける」：サーバー状態 = TanStack Query、UI 状態 = Zustand。1つのライブラリで全部やらない。
> i18n は文言をキー管理し、利用者の言語で出し分ける。決済ファネル（QR→金額選択→完了）に GA4 イベントを仕込む。

## バックエンド（apps/api）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| Web フレームワーク | Hono（Node.js / `@hono/node-server`） | ^4 | ルーティング・HTTP |
| バリデーション | Zod（+ `@hono/zod-validator`） | zod ^3.23 | リクエスト検証・スキーマ |
| ORM | Drizzle ORM | ^0.31 | DB アクセス。Repository 層で `db.execute(sql\`...\`)` の生 SQL |
| 認証（検証） | jose（Supabase JWT の検証） | ^5.3 | 発行は Supabase。バックは送られた JWT を検証するのみ |
| 決済 | Stripe SDK | - | `infrastructure/` に隔離。Connect で店員さんへ分配 |
| 実行 | tsx | ^4.10 | 開発・本番ともに TS ソースを直接起動 |

> 本番も `node dist` ではなく **tsx でソース起動**（ワークスペースを TS ソース参照する構成のため）。`tsx` は dependencies に置く。

## 決済（Stripe）

| 項目 | 採用技術 | 役割 |
| --- | --- | --- |
| 決済代行 | Stripe | Apple Pay / Google Pay / カード / PayPay をまとめて提供 |
| 分配 | Stripe Connect | お金をお客さま→店員さん個人へ。**運営の残高を一度も経由させない**ことで資金移動業（資金決済法）の論点から外す。免許を持つのは Stripe。運営は application_fee（手数料）を受け取るだけ |
| 確定通知 | Stripe Webhook | 決済成立はブラウザでなく Webhook を正として確定 |
| 不正対策 | Stripe Radar / 3D セキュア | 3DS は国内オンライン決済で対応必須 |

**実装上の必須ルール（決済特有）**

- **課金タイプは「運営残高を経由しない」ものを選ぶ**：資金移動業を避ける肝は「お金が運営の残高に乗らないこと」。以下から選定する。
  - ◎ **Direct charge**：店員の Connected Account に直接課金、運営は application_fee のみ受領。投げ銭に最適。
  - ○ **Destination charge**：運営に課金→`transfer_data[destination]` で店員へ即ルーティング。運営が merchant of record になる。可。
  - ⚠️ **Separate charges and transfers は使わない**：運営が一旦受けて後で transfer する＝「預かって送る」に最も近く、資金移動の論点に踏み込むため採用しない。
- **本人確認は後ろ倒し（保留残高モデル）**：店員の本人確認・口座登録が未完了でも投げ銭は受け付け、**未着金の保留残高**として記録する。Stripe Connect オンボーディング完了の Webhook をトリガーに payout 可能状態へ遷移させる（要件定義書 3.5「体験を登録の前に」）。保留残高の保持・着金条件は Service / Model 層で明示管理する。
- **Webhook は raw body で受ける**：署名検証は生のリクエストボディが必要。Hono の自動 JSON パースを通さないルートを用意する。
- **冪等性を持たせる**：Webhook は同じイベントが再送されうる。処理済みイベントIDを記録し、重複は無視（二重記録の防止）。
- **金額計算は Model 層（純粋関数）**：上乗せ・手数料・店員さんへの支払額を純粋関数化し、Vitest でテスト対象にする。
- **カード情報を自前サーバーに通さない**：Checkout / Elements を使い PCI 負担を最小化。
- **PayPay は後追いで有効化**：Stripe での PayPay 有効化は審査に数週間かかる。ローンチは Apple Pay / Google Pay / カードで先行。

## 共有パッケージ（packages/shared）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| スキーマ/型 | Zod | ^3.23 | フロント・バック共有の Zod スキーマと型（`z.infer`） |

## データベース（packages/db）

| 項目 | 採用技術 | バージョン | 役割 |
| --- | --- | --- | --- |
| DB | Supabase（PostgreSQL） | - | 認証と同じ Supabase に集約 |
| ORM | Drizzle ORM | ^0.31 | スキーマ定義・クエリ |
| ドライバ | postgres（postgres-js） | ^3.4 | DB 接続（Render の Node 環境から直接接続） |
| マイグレーション | drizzle-kit | ^0.22 | `public.*` を管理（`auth.*` は Supabase が管理） |
| （任意）リアルタイム | Supabase Realtime | - | 「ありがとうが届きました」を店員さん画面へ即時反映 |
| （任意）ストレージ | Supabase Storage | - | 店員さんのプロフィール画像など |

> マイグレーションは **`auth.*` は Supabase 任せ、`public.*` を drizzle-kit で管理**と住み分ける。

## 認証方式

- **プロバイダ認証は Supabase Auth**（Google / メール の2つで開始。パスワードは自前で持たない）
- **お客さまは認証なし**（投げ銭は QR→決済のみ）
- トークンの**発行は Supabase**、Hono バックは送られた **Supabase JWT を検証**するだけ
- 受け取り側（店員さん）の本人確認は **Stripe Connect のオンボーディング**が担う

## アクセス制御

- **アクセス制御は Hono の Service 層で守る**（バックはサービスロールで DB アクセス）
- **「金額は本人のみ閲覧可」も Service 層のルールとして実装**。RLS と二重管理にせず片方に統一
- 対外的（店・他スタッフ向け）には金額を出さず、**感謝の件数・メッセージのみ**を見せる

## ホスティング / デプロイ

| 対象 | 採用 | 補足 |
| --- | --- | --- |
| フロント（静的SPA） | Cloudflare Workers（静的アセット配信） | `wrangler.jsonc` で `assets` 配信 + SPA フォールバック |
| バック（Node API） | Render | tsx 起動。Build/Start/pre-deploy(migrate) を設定。ローンチ時は常時起動の有料プラン（無料はスリープ＝コールドスタートが決済体験に致命的） |
| データベース | Supabase（PostgreSQL） | 認証と同居で管理一本化 |
| 決済 Webhook | Render のドメイン配下 `…/webhooks/stripe` | 本番URLを Stripe に登録。Stripe CLI でローカル転送して署名検証を確認 |
| アクセス解析 | Google Analytics（GA4 / gtag） | 計測IDは `VITE_GA_ID` 環境変数。未設定なら無効。SPAのためルート変更時に手動 page_view。EU客向けに Cookie 同意（GDPR）を考慮 |

## アーキテクチャ規約

- **Feature-based 構成**（フロント・バック共通）。「その機能が消えたら一緒に消えるか」で配置を判断
- **バックは 4 層分離**：`Route → Service → Model（純粋関数）→ Repository（生SQL）`
  - Route: HTTP 入口（薄く）／Service: ユースケース橋渡し・アクセス制御／Model: 金額計算など業務ルールの純粋関数（DBアクセスなし・テスト対象）／Repository: DB アクセスのみ
- **feature 同士は直接 import しない**。依存はコンポジションルート（`app.ts`）でコールバック注入して配線
- **外部 API（Stripe / Supabase 等）は infrastructure/ に隔離**（feature ではない）
- **生 SQL は Repository 層のみ**（Drizzle の `db.execute(sql\`...\`)`）
- **Zod スキーマは packages/shared** に置きフロント・バックで共有
- **スタイルは Tailwind ユーティリティのみ**。色・余白等はトークン化（config 登録）、ハードコード/インラインスタイル禁止（動的値を除く）
- **Webhook ルートだけは raw body**（自動パースを通さない）。**冪等性**を Repository/Model で担保
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
│   │       │                #   例: tip（投げ銭）/ staff（店員）/ store（店）
│   │       ├── i18n/        # 言語辞書（ja / en）
│   │       └── lib/         # 横断ユーティリティ（api-client, auth, analytics 等）
│   └── api/                 # バック（Hono / Node）
│       └── src/
│           ├── app.ts          # コンポジションルート（依存配線・ルートマウント）
│           ├── features/       # 機能単位（route/service/model/repository）
│           ├── infrastructure/ # Stripe / Supabase 認証など外部依存を隔離
│           └── middleware/     # Supabase JWT 検証ミドルウェア等
├── packages/
│   ├── shared/              # Zod スキーマ・共有型・定数
│   └── db/                  # Drizzle スキーマ・マイグレーション・接続（Supabase 接続）
├── turbo.json              # タスクパイプライン
└── pnpm-workspace.yaml     # ワークスペース定義
```

## 新規プロジェクトでの立ち上げ手順（概要）

1. pnpm + Turborepo でモノレポ初期化、`apps/web` `apps/api` `packages/shared` `packages/db` を作成
2. Supabase プロジェクト作成（認証：Google・メールを有効化）、接続情報を取得
3. shared に Zod スキーマ、db に Drizzle スキーマ＋マイグレーション基盤（`public.*` を管理）
4. api を Hono で 4 層構成、Supabase JWT 検証ミドルウェア、shared/db を workspace 依存に
5. web を Vite+React+TanStack Router/Query+Zustand+Tailwind、react-i18next（ja/en）、API は Hono RPC で型安全に
6. Stripe 連携：`infrastructure/` に Stripe、Connect オンボーディング、Webhook（raw body・冪等性）、金額計算は Model（純粋関数＋Vitest）
7. デプロイ：フロント=Cloudflare Workers、バック=Render（常時起動プラン）、DB=Supabase
8. Stripe Webhook の本番URL登録、Stripe CLI で署名検証を確認。PayPay は審査申請（後追い有効化）
9. 解析：GA4（`VITE_GA_ID`）、EU 客向け Cookie 同意

---

### 今後の宿題

- データモデル設計（店・店員・投げ銭・メッセージ。「金額は本人のみ」「感謝データの構造化」をどう持つか）
- 通知手段（初期はメール想定。Supabase Realtime / 将来 LINE・プッシュ）
- アクセス制御を Service 層に統一する具体ルールの明文化
