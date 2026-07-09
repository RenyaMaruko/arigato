# デプロイ手順

構成（tech-stack.md の方針どおり）:

```
ブラウザ ── https ──▶ フロント: Cloudflare Workers（静的SPA・wrangler.jsonc）
                         │ VITE_API_URL
                         ▼
                     バック: Render（Hono API・常時起動） ──▶ Supabase（DB/Auth/Storage）
                         ▲
                         └── Stripe Webhook（本番URLを登録。ローカルの stripe listen の代替）
```

現段階は **テスト公開（ステージング）**: Stripe はテストモードのまま・Supabase は開発プロジェクトを共用。
本物のお金を扱う本番ローンチ時のチェックリストは末尾。

---

## 1. バックエンド（Render）

1. https://render.com → New → **Web Service** → GitHub リポジトリを接続
2. 設定:
   | 項目 | 値 |
   |---|---|
   | Root Directory | （リポジトリルートのまま） |
   | Build Command | `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @arigato/db migrate` |
   | Pre-Deploy Command | （不要。マイグレーションはビルドに含めている） |
   | Start Command | `corepack pnpm --filter @arigato/api start` |
   | Health Check Path | `/health` |
   | プラン | テスト公開は Free でも可（**15分でスリープ→復帰30秒〜1分**。最初の1回が遅いのは仕様）。本番ローンチは Starter 以上（常時起動） |
3. 環境変数（Environment）:
   | キー | 値 |
   |---|---|
   | `DATABASE_URL` | Supabase の接続文字列（ローカル `apps/api/.env` と同じ） |
   | `STRIPE_SECRET_KEY` | sk_test_...（テストモードのまま） |
   | `STRIPE_WEBHOOK_SECRET` | ※手順3で取得してから設定 |
   | `SUPABASE_URL` | 同ローカル |
   | `SUPABASE_SECRET_KEY` | 同ローカル |
   | `WEB_BASE_URL` | フロントURL（手順2の後に設定。QR/招待URLの生成に使う） |
   | `COREPACK_ENABLE_DOWNLOAD_PROMPT` | `0`（corepack のダウンロード確認を無効化） |
   ※ `PORT` は Render が自動注入（server.ts は対応済み）
   ※ Render では `corepack enable` はシステム領域が読み取り専用のため失敗する。`corepack pnpm …` で直接実行する
4. デプロイ → `https://<app>.onrender.com/health` が 200 なら OK

## 2. フロントエンド（Cloudflare Workers）

1. https://dash.cloudflare.com でアカウント作成（無料でOK）
2. ビルド用環境変数を用意:
   ```bash
   cd apps/web
   cp .env.production.example .env.production
   # VITE_API_URL に Render のURL、他はローカル .env と同じ値を記入
   ```
3. ビルド＆デプロイ:
   ```bash
   pnpm build          # dist/ を生成（.env.production が埋め込まれる）
   npx wrangler deploy # 初回はブラウザでCloudflareログインを求められる
   ```
4. 発行された `https://arigato-web.<account>.workers.dev` がフロントURL
5. Render の `WEB_BASE_URL` にこのURLを設定して**バックを再デプロイ**

## 3. Stripe Webhook（本番URL登録）

1. Stripe ダッシュボード（**テストモード**）→ 開発者 → Webhook → **エンドポイントを追加**
2. URL: `https://<app>.onrender.com/webhooks/stripe`
3. **「接続されたアカウントでのイベントをリッスンする」を選択**（重要。Direct charge のイベントは連結アカウント側で発生する）
4. イベントを選択:
   - `payment_intent.succeeded` / `payment_intent.payment_failed`
   - `account.updated`
   - `payout.paid` / `payout.failed`
   - `charge.refunded` / `charge.dispute.created`
   - `charge.succeeded` / `charge.updated`（bt 鏡保存の埋め直しに必要。決済直後は balance_transaction 未付与のことがあり、後続の charge.updated で埋める）
5. 作成後に表示される **署名シークレット（whsec_...）** を Render の `STRIPE_WEBHOOK_SECRET` に設定 → 再デプロイ

## 4. Supabase の URL 設定

- Authentication → URL Configuration:
  - **Site URL**: フロントURL
  - **Redirect URLs**: `https://arigato-web.<account>.workers.dev/**` を追加
  （確認メール・パスワードリセットの戻り先。ローカルの `http://localhost:5173/**` も残してよい）

## 5. Apple Pay のドメイン登録

- Stripe ダッシュボード → 設定 → **決済手段ドメイン（Payment method domains）** → フロントのドメイン
  （`arigato-web.<account>.workers.dev`）を追加
- テスト: **実機の iPhone / Safari**（Wallet に実カード登録済み）でフロントを開く → 投げ銭 →
  Apple Pay ボタンが表示される。**テストモードなので実際の請求は発生しない**

## 6. 動作確認チェックリスト

- [ ] `/health` 200・フロント表示
- [ ] アカウント作成 → 確認メール → ログイン → プロフィール作成
- [ ] 店舗作成 → スタッフ/管理者招待 → 参加
- [ ] QRから投げ銭（カード `4242…` / 即available `4000 0000 0000 0077`）→ Webhookで確定（ダッシュボードのWebhook配信ログも確認）
- [ ] Apple Pay ボタン表示・決済（実機Safari）
- [ ] 本人確認（埋め込み）→ 申請中 → 承認 → 送金 → 完了画面
- [ ] Stripe ダッシュボード → Webhook のエンドポイントでエラーが無いこと

## 7. PayPay について

PayPay はデプロイだけでは使えない。**Stripe での PayPay 有効化申請（審査あり）**が必要。
承認後: ダッシュボードで決済手段を有効化 → アプリ側の「準備中」解除の実装を行う。

---

## 本番ローンチ時のチェックリスト（実際にお金を扱う時にやる）

1. **Supabase 本番プロジェクトを新規作成**（開発と分離）
   - マイグレーション適用（`DATABASE_URL` を本番に向けて `pnpm --filter @arigato/db migrate`）
   - Auth 設定（Email+Password 有効・メール確認 ON・Redirect URLs）
   - Storage: `media` バケット（public）作成
   - 新しい `SUPABASE_URL` / キー類へ差し替え
2. **Stripe 本番モードへ切替**
   - 本番アカウントの有効化（事業情報の提出）
   - `sk_live_` / `pk_live_` へ差し替え・**本番用 Webhook エンドポイントを再登録**（whsec も差し替え）
   - 決済手段ドメインを本番ドメインで再登録
3. **独自ドメイン**（フロント・API）を取得し Cloudflare / Render に設定
4. **独自 SMTP**（SendGrid 等）を Supabase に設定（確認メールのレート制限・到達率対策）
5. 環境変数一式を本番値へ差し替え（Render / `.env.production`）
6. 日次照合ジョブ（reconcile）の定期実行を有効化・Webhook 未処理（processed_at IS NULL が滞留）の監視
