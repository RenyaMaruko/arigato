# （仮称）Arigato 製品仕様書

リアル投げ銭サービス / spec v1.0

> 本仕様書は `requirements.md`（要件）・`tech-stack.md`（技術）・`architecture.md`（アーキテクチャ）・`design-tokens.md`（デザイン）を「正」とし、それらを実装可能な単位に構造化したものである。仕様の追加・発明はせず、要件にある範囲のみを定義する。実装詳細コード（SQL文・関数本体）は本書では書かず、契約条件として `sprints/sprint-N.md` に落とす。

---

## 1. 概要

接客現場で、お客さまが気に入った店員さん個人に、QRコードからその場で少額の「ありがとう（投げ銭）」をメッセージとともに送れる Web サービス。お金は店を通さず店員さん個人へ直接届き（運営の残高を経由しない）、利用は店が承認している前提で成り立つ。設計の軸は「感謝＞金額」「金額は本人のみ」「店はお金に触れない」「体験を登録の前に（本人確認は後ろ倒し）」。

---

## 2. ターゲットユーザー / 対応端末

日本人ユーザー（日本語のみで開始）。インバウンド対応は将来拡張だが、i18n の構造（react-i18next / 文言キー管理）だけは初期から担保する。

| ロール | 認証 | 対応端末 | 主な利用場面 |
|---|---|---|---|
| お客さま | なし（登録不要） | スマホのみ（モバイル幅中央1カラム） | QR を読み、その場で投げ銭 |
| 店員さん | Supabase Auth（Google / メール） | スマホのみ | 接客の合間に QR 発行・受取確認・申告データ出力 |
| 店 | Supabase Auth（Google / メール） | スマホのみ | 導入承認・スタッフ管理・感謝の可視化（金額なし） |
| 運営 | Supabase Auth | **PC** | 管理ダッシュボード・集計・取引管理 |

- 現場の3者（tip / staff / store）は最大幅 430px・中央1カラム・スマホアプリ風で統一する。
- PC デザインを作るのは運営の admin だけ。

---

## 3. 機能一覧（優先度: 高 / 中 / 低）

### お客さま（tip）
- 高: QR から投げ銭画面が開く（アプリ不要・登録不要）
- 高: 送り先店員さんの顔写真・名前・店名・一言の表示
- 高: 定額ボタンで金額選択（¥100 / ¥300 / ¥500）
- 高: 決済（Apple Pay / Google Pay 最優先、カード）
- 高: 送信後の完了表示（誰に・いくら・どのメッセージを再掲）
- 中: 一言メッセージ（任意・最大80文字）
- 低: 言語切替UI（構造のみ。初期は日本語固定で可）

### 店員さん（staff）
- 高: 店の招待リンク/コード経由でアカウント作成（Google / メール）し所属確定。本人確認なしで QR 発行まで到達
- 高: 個人QR の発行（印刷可能な形・固定URL）
- 高: 受け取った投げ銭が「保留残高（未着金）」として溜まる
- 高: 受取履歴の閲覧（**金額は本人のみ**）とメッセージ閲覧
- 高: 本人確認・口座登録（Stripe Connect オンボーディング、後回し可）。完了で着金可能へ遷移
- 中: 投げ銭着信の通知（初期はメール / Realtime 任意）
- 中: 確定申告に使えるデータ（受取記録）の出力（CSV）

### 店（store）
- 高: 導入の承認
- 高: スタッフの招待（招待リンク/コード発行）＝スタッフ追加方式A
- 高: 所属スタッフ一覧の管理（招待・在籍管理。QR発行の主体は店員本人）
- 中: 感謝の可視化（ありがとうの件数・お客さまの声）
- 高（禁止事項）: 金額・金額ランキングは見せない

### 運営（admin / PC）
- 中: 店・店員アカウントの管理
- 中: 感謝データの蓄積状況の確認
- 中: 取引・手数料の集計

---

## 4. 技術スタック推奨（既定。`tech-stack.md` を正とする）

- モノレポ: pnpm workspaces + Turborepo（`apps/web` `apps/api` `packages/shared` `packages/db`）
- フロント: Vite + React + TypeScript / TanStack Router・Query / Zustand（UI状態のみ）/ Tailwind（トークンを config 登録）/ react-i18next / Hono RPC（`hc`）
- バック: Hono（tsx 起動）/ Zod + `@hono/zod-validator` / Drizzle ORM（Repository層で生SQL）/ jose（Supabase JWT 検証）/ Stripe SDK（`infrastructure/` 隔離）
- 共有: `packages/shared`（Zod スキーマ・型・定数）
- DB / 認証: Supabase（PostgreSQL）。`public.*` は drizzle-kit、`auth.*` は Supabase 管理
- 決済: Stripe Connect（Direct charge 基本）+ Webhook（raw body・冪等性）
- バック4層: Route → Service（アクセス制御）→ Model（純粋関数・金額計算）→ Repository（生SQL）。feature 同士は直接 import せず `app.ts` で配線

---

## 5. 画面遷移

### お客さま（tip）— モック4画面に対応
```
QR読取
  ↓
[01 金額を選ぶ]  /tip/:staffId
  - 顔写真・名前・店名 / 金額3択 / メッセージ(任意)
  - 「Pay で送る」「G Pay で送る」
  ↓
[03 支払い方法]（ボトムシート sheetUp / 背面スクリム）
  - Apple Pay / Google Pay / カード / ✕・スクリムタップで [01] へ戻る
  ↓ 決済成立（PaymentIntent succeeded を起点に完了表示）
[04 完了]  /tip/:staffId/complete
  - 「ありがとうを届けました！」/ 誰に・¥◯◯ / メッセージ再掲
  - 「もう一度送る」→[01] / 「閉じる」
```
> 注: [02 メッセージ入力済み] は [01] の入力後状態であり、別ルートではなく [01] の状態違い。

### 店員さん（staff）
```
ログイン → ホーム（保留残高・着金状態サマリ）
  ├ 自分のQR（印刷用）
  ├ 受取履歴（金額あり・本人のみ）→ 各投げ銭の詳細（メッセージ・文脈）
  ├ 本人確認・口座登録（Stripe Connect オンボーディングへ遷移 → 戻り）
  └ 申告データ出力（CSV）
```

### 店（store）
```
ログイン → ホーム
  ├ 導入承認
  ├ スタッフ一覧管理（追加・QR発行窓口）
  └ 感謝の可視化（件数・お客さまの声。金額は一切なし）
```

### 運営（admin / PC）
```
ログイン → ダッシュボード（店/店員/取引/手数料の一覧・集計）
```

---

## 6. データモデル（論理設計 / `public.*`）

> 物理スキーマ（Drizzle 定義・生SQL）は Generator が実装する。ここでは持ち方の方針を定義する。`auth.*` は Supabase 管理、本サービスは `public.*` を管理。

### store（店）
- id, name, status（pending / approved）, approved_at, created_at
- 店はお金に触れないため、決済・残高に関わるカラムを持たない。

### staff_invite（スタッフ招待）— 追加方式A
- id, store_id, code（一意・招待コード/リンク用トークン）, status（pending / accepted / revoked）, created_at, accepted_at, accepted_staff_id
- **スタッフ追加は店が招待を発行 → 店員が招待経由でアカウント作成し所属確定**。これにより「店承認」が招待で自然に担保される。
- 店員は自分のアカウント作成時に code を消費して staff.store_id が確定する。

### staff（店員さん）
- id, auth_user_id（Supabase auth.users 参照）, store_id（招待経由で確定）, display_name, headline（一言）, avatar_url
- stripe_account_id（Connect の Connected Account。未連携は null）
- identity_status（本人確認・着金可否の状態。下記7参照）
- created_at
- **QR は staff.id を指す固定 URL（`/tip/:staffId`）として発行**。別テーブルを持たず staff に紐づく。**一度発行したら不変（再発行・失効は当面なし）**。発行主体は店員本人（店ではない）。

### tip（投げ銭）— 構造化された感謝データの中核
- id, staff_id, store_id（送信時点の所属を固定保存＝後で異動しても文脈が残る）
- amount（店員さんに届く満額・円）, platform_fee（運営手数料・円）, customer_total（お客さま支払額・円）
- message（任意・最大80文字）
- stripe_payment_intent_id, status（pending / succeeded / failed）
- settlement_status（保留 held / 着金可能 payable / 着金済 paid）
- created_at, succeeded_at
- 「いつ・どの店で・誰が・どんな文脈で」を構造化: created_at（いつ）/ store_id（どの店）/ staff_id（誰）/ message（どんな文脈）。
- **金額は本人のみ閲覧可**: amount を含む読み取りは Service 層で staff 本人に限定。店・他スタッフ向け取得経路は amount を返さない（件数・message のみ）。

### 保留残高 / 着金（保留残高モデル）
- 残高は tip の `settlement_status` を真実の源泉とし、合算は Service/Model で算出する（held 合計＝保留残高）。
- 着金（payout）の状態遷移は7章を参照。

### webhook_event（冪等性）
- stripe_event_id（一意）, type, processed_at
- 受信済イベントIDを記録し、重複再送は無視（二重記録防止）。raw body で署名検証。

### 通知（任意・中優先）
- notification: id, staff_id, tip_id, read_at, created_at（「〇〇さんからありがとうが届きました」）。初期はメール送信でも可。

---

## 7. 状態遷移

### 店員さんの本人確認 / 着金可否（identity_status）
```
none（未着手）
  ↓ Connect オンボーディング開始
pending（審査中 / 情報不足）
  ↓ account.updated Webhook で charges/payouts_enabled=true
verified（着金可能）
```
- `verified` 未満でも投げ銭は受け付ける（Direct charge は Connected Account に直課金できるが、payout は本人確認完了まで Stripe 側で保留される）。
- Model 層の `canPayout()` が identity_status から着金可否を純粋関数で判定する。

### 投げ銭の決済 / 着金（status × settlement_status）
```
[決済]   pending ──(payment_intent.succeeded)──▶ succeeded
                └──(payment_intent.payment_failed)──▶ failed

[着金]   held（本人確認前に成立した分）
           └──(account.updated: payouts_enabled=true)──▶ payable
                                                            └─(Stripe payout)─▶ paid
         ※ 本人確認済の状態で成立した分は succeeded 時に payable から開始
```
- 決済成立はブラウザでなく **Webhook を正**として確定する。
- Webhook 取りこぼし対策に夜間 Cron で Stripe 突合（`stripe-reconcile.job.ts`）。

---

## 8. API エンドポイント一覧

> Hono + `@hono/zod-validator`。認証必須ルートは Supabase JWT 検証ミドルウェアを通す。お客さま系は認証なし。アクセス制御（金額は本人のみ等）は Service 層で実装。

### tip（お客さま・認証なし）
| メソッド | パス | 役割 |
|---|---|---|
| GET | `/tip/:staffId` | 投げ銭画面の表示情報（顔写真・名前・店名・一言）。金額・履歴は返さない |
| POST | `/tip/:staffId/intent` | 投げ銭の PaymentIntent 作成（金額・メッセージを受け、Direct charge / application_fee を構成）。tip を pending で記録 |
| GET | `/tip/:staffId/complete?tipId=` | 完了表示用（誰に・¥◯◯・メッセージ）。amount は当該 tip の送金額のみ |

### webhooks（認証なし・raw body）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/webhooks/stripe` | 署名検証 → 冪等性確認 → tip.status / settlement_status / staff.identity_status を更新 |

### staff（認証必須・本人スコープ）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/staff/me` | 初回プロフィール作成（display_name・headline・**招待コードで store 紐付け**）。本人確認なしで成立 |
| GET | `/staff/me` | 自分のプロフィール・identity_status・QR用URL |
| GET | `/staff/me/balance` | 保留残高（held合計）・着金可能額の集計（**本人のみ**） |
| GET | `/staff/me/tips` | 受取履歴（**金額・メッセージ含む。本人のみ**） |
| POST | `/staff/me/connect/onboard` | Stripe Connect オンボーディングリンクの発行 |
| GET | `/staff/me/tax-report` | 申告データ CSV 出力（受取記録） |

### store（認証必須・店スコープ）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/store/:storeId/approve` | 導入承認（status を approved に） |
| POST | `/store/:storeId/invites` | スタッフ招待の発行（招待リンク/コード生成）＝方式A |
| GET | `/store/:storeId/invites` | 発行済み招待の一覧・状態（pending/accepted/revoked） |
| GET | `/store/:storeId/staff` | 所属スタッフ一覧（在籍管理） |
| GET | `/store/:storeId/gratitude` | 感謝の可視化（店全体の件数・お客さまの声フィード・スタッフ別件数。**金額は返さない／件数で並べ替え・順位付けしない**） |
| GET | `/invites/:code` | 招待コードの検証（店員のアカウント作成画面で所属先を表示。認証なし可） |

### admin（認証必須・運営 / PC）
| メソッド | パス | 役割 |
|---|---|---|
| GET | `/admin/stores` `/admin/staff` | 店・店員アカウント管理 |
| GET | `/admin/transactions` | 取引・手数料の集計 |

---

## 9. 決済フロー（Stripe Connect）

### 課金タイプ
- **Direct charge を基本**（◎）: 店員の Connected Account に直接課金し、運営は `application_fee_amount` のみ受領。運営の残高を一度も経由させない。
- Destination charge は可（○）。**Separate charges and transfers は使わない**（資金移動の論点に踏み込むため）。
- カード情報は自前サーバーに通さない（Checkout / Elements）。Apple Pay / Google Pay を最優先表示。PayPay は審査後の後追い有効化。

### 金額計算（Model 層・純粋関数・Vitest 対象）
- `calculateCustomerTotal()`: 投げ銭額 + 上乗せ手数料 = お客さま支払額（上乗せはお客さま側に乗せ、店員さんからは引かない＝満額が届く）。
- `calculatePlatformFee()`: 運営の取り分（application_fee）。
- `calculateStaffAmount()`: 店員さんに届く満額。
- `canPayout()`: identity_status から着金可否を判定。

### Webhook
- raw body で受信 → 署名検証 → `webhook_event` で冪等性確認 → Service が状態更新。
- 主要イベント: `payment_intent.succeeded`（tip 確定）/ `payment_intent.payment_failed`（失敗）/ `account.updated`（identity_status・settlement_status 遷移）。
- 取りこぼしは夜間 Cron の Stripe 突合で二重化。

---

## 10. 横断ルール（実装時の不変条件）

- 金額は本人のみ: amount を返す経路は staff 本人 API のみ。store / admin（集計除く）/ 他スタッフへは件数・message のみ。
- 店はお金に触れない: store 系 API・モデルに残高 / 着金 / amount を持たせない。
- 運営の残高を経由しない: Direct charge を使い、Separate charges and transfers を実装しない。
- Webhook を正: 完了確定はブラウザの戻り値でなく Webhook を真実とする。
- i18n 構造を担保: 文言はキー管理。初期は日本語辞書のみで可。
- スタイルは Tailwind トークンのみ。3者画面は最大幅 430px・中央1カラム。
- コメントは日本語。関数/コンポーネント頭に役割、処理の節目に一言。
