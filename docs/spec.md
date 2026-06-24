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
- 高: 店の招待リンク経由で参加。**新規はプロフィール作成→参加、既存ユーザーはプロフィール流用で即参加**。参加完了画面「〇〇店に参加しました！」を表示。本人確認なしで到達
- 高: **複数店の掛け持ち可**（人は複数 staff_store を持てる）。既に同じ店に所属済みの招待は「既に所属しています」案内
- 高: 店ごとのQR発行（所属＝membership ごと・印刷可能・固定URL）
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
QR読取（QR は membership＝人×店 を指す）
  ↓
[01 金額を選ぶ]  /tip/:membershipId
  - 顔写真・名前・店名（membership から人＋店を解決）/ 金額3択 / メッセージ(任意)
  - 「Pay で送る」「G Pay で送る」
  ↓
[03 支払い方法]（ボトムシート sheetUp / 背面スクリム）
  - Apple Pay / Google Pay / カード / ✕・スクリムタップで [01] へ戻る
  ↓ 決済成立（PaymentIntent succeeded を起点に完了表示）
[04 完了]  /tip/:membershipId/complete
  - 誰に・¥◯◯ / メッセージ再掲
  - 「もう一度送る」→[01] / 「閉じる」
```
> 注: [02 メッセージ入力済み] は [01] の入力後状態であり、別ルートではなく [01] の状態違い。

### 店員さん（staff）— 参加フロー（招待）
```
招待リンク /invite/:code（予告：〇〇店 に所属します）
  → [はじめる] → （未ログインならログイン/サインアップ）
    ├ 新規ユーザー → プロフィール作成 → 送信（参加確定）→ 参加完了「〇〇店に参加しました！」→ ホーム
    ├ 既存ユーザー（別店所属）→ プロフィール流用で参加確定 → 参加完了「〇〇店に参加しました！」→ ホーム
    └ 既に同じ店に所属済み → 「すでに〇〇店に所属しています」案内 → ホーム
```
> 既存ユーザーが /staff/setup 等の作成ルートに来ても、プロフィール作成済みなら作成画面は出さず参加完了/ホームへ（ガード）。

### 店員さん（staff）— ホーム
```
ログイン → ホーム（保留残高・着金状態サマリ）
  ├ 所属店の一覧（複数可）。各店ごとの QR（印刷用）
  ├ 受取履歴（金額あり・本人のみ。店ラベル付き）→ 各投げ銭の詳細
  ├ 本人確認・口座登録（Stripe Connect。人ごとに1回）
  └ 申告データ出力（CSV）
```

### 店（store）
```
ログイン（自己登録）
  → 初回：店舗を自分で作成（店名等）＋導入承認に同意（就業規則整合の一手間）
  → ホーム
     ├ スタッフ招待（方式A）・スタッフ一覧管理
     └ 感謝の可視化（件数・お客さまの声。金額は一切なし）
```
> 店はセルフサーブで登録する（運営の事前発行・claim は廃止）。運営は事後に監視・必要なら停止するだけ（事前の関所にしない）。

### 運営（admin / PC）
```
ログイン → ダッシュボード（店/店員/取引/手数料の一覧・集計）
```

---

## 6. データモデル（論理設計 / `public.*`）

> 物理スキーマ（Drizzle 定義・生SQL）は Generator が実装する。ここでは持ち方の方針を定義する。`auth.*` は Supabase 管理、本サービスは `public.*` を管理。

### store（店）
- id, name, owner_auth_user_id（作成した店アカウント＝Supabase auth.users）, adoption_agreed_at（導入承認に同意した日時）, created_at, description/industry/logo_url（任意）
- **店はセルフサーブで自分の店舗を作成**する（owner_auth_user_id ＝ 作成者）。運営の事前発行・claim は廃止。
- 「導入承認」は店自身の一手間（同意）として `adoption_agreed_at` を記録する（status の pending→approved という運営審査ゲートは廃止）。
- 店はお金に触れないため、決済・残高に関わるカラムを持たない。
- 運営は事後に監視し、必要なら停止できる（suspended フラグ等は admin 実装時に追加）。

### 店員さんの所属モデル（多対多・掛け持ち対応）
- **1人の店員（staff＝人）が複数の店に所属できる**（例：カフェAとバーBで働く）。所属は `staff_store`（中間テーブル）で表す。
- **staff（人）はプロフィール（表示名・一言・写真・Stripe口座・本人確認状態）を1つ持ち、全所属店で共通**。
- **QR は「人×店」の所属（membership）ごとに発行**＝店ごとに別QR。店ごとに違うQRを貼る。投げ銭はそのQRの店にカウント（帰属が明確）。お金は人（1つのStripe口座）に届く。

### staff_invite（スタッフ招待）— 追加方式A
- id, store_id, code（一意・招待コード/リンク用トークン）, label（任意メモ＝誰宛か。例「佐藤さん」）, status（pending / accepted / revoked）, created_at, accepted_at, accepted_staff_id
- **店が招待を発行 → 店員が招待経由で参加**。これにより「店承認」が招待で自然に担保される。label は招待中一覧での識別用（任意）。
- 招待を消費すると、その店員（人）に対し当該店の **staff_store（所属）が1件作られる**（既存ユーザーはプロフィール流用、新規ユーザーはプロフィール作成と同時）。

### staff（店員さん＝人）
- id, auth_user_id（Supabase auth.users 参照）, display_name, headline（一言）, avatar_url
- stripe_account_id（Connect の Connected Account。未連携は null。**人ごとに1つ**）
- identity_status（本人確認・着金可否の状態。下記7参照。**人ごと**）
- created_at
- **store_id は持たない**（所属は staff_store で表す）。

### staff_store（所属＝membership）
- id, staff_id, store_id, created_at（一意制約：同じ (staff_id, store_id) は1件＝二重所属不可）
- **QR の単位**。QR URL は membership を指す（例 `/tip/:membershipId`）→ 投げ銭画面は staff(人)＋store(店) を解決して表示。**固定・再発行/失効なし**。発行主体は店員本人。
- 退店時はこの所属を外す（人やプロフィールは残る）。

### tip（投げ銭）— 構造化された感謝データの中核
- id, staff_id, store_id（QR=membership の店を送信時点で固定保存）, membership_id（任意・追跡用）
- amount（投げ銭の額面＝お客さま支払額・円）, platform_fee（運営手数料・円。application_fee）, customer_total（お客さま支払額・円。上乗せ廃止のため = amount）。店員手取りは amount × 約85%
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

### payout（送金＝振込申請）
- id, staff_id, amount（送金額＝店員が銀行で受け取る額・円）, status（pending / paid / failed）, stripe_payout_id, created_at, arrived_at（着金日・nullable）, failure_reason（nullable）
- **手動送金（メルカリ型）**：verified（口座登録済＝payouts_enabled）な店員が、着金可能額（payable な tip の手取り合計）を自分のタイミングで銀行へ送金申請する。
- **最低送金額 ¥100**（`MIN_PAYOUT_AMOUNT = 100`）。
- **送金額は着金可能額の全額**（v1。部分送金は将来）。
- 申請時：対象の payable な tip を **paid** に更新し、その手取り合計を payout.amount として Stripe payout を実行（Connected Account の残高→銀行）。
- 確定は Webhook を正とする：`payout.paid`→status=paid・arrived_at 記録／`payout.failed`→status=failed・該当 tip を payable へ戻す。
- 送金手数料は店員から取らない（日本の payout は無料前提）。着金は申請から数営業日。

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
                                                            └─(店員が送金申請→Stripe payout)─▶ paid
         ※ 本人確認済の状態で成立した分は succeeded 時に payable から開始
         ※ payout.failed の場合は paid → payable へ戻す
```
- **「正」を2段構えにする**:
  - **お客さま向けの完了/失敗表示**は、ブラウザの決済処理結果（Stripe.js `confirmPayment` が返す PaymentIntent ステータス）で**即時に出す**。Webhook 到着を待たない（待たせない・永久ロードを作らない）。
    - `succeeded` → 完了表示（誰に・¥◯◯・メッセージは作成済み tip 記録から表示）
    - 失敗（confirm エラー）→ 決済シート内でその場でエラー表示（完了画面へ進めない）
    - `processing`（PayPay 等の後日確定手段）→「受け付けました（結果は後ほど）」表示。ここだけ後続の状態変化を待つ（フォールバックでポーリング/タイムアウト案内）
  - **店員さんの残高・受取履歴・着金（settlement）は引き続き Webhook を正**としてサーバー側で確定する（お客さまのブラウザ・画面に依存しない）。画面を閉じても Webhook が tip.status / settlement_status を更新する。
- Webhook 取りこぼし対策に夜間 Cron で Stripe 突合（`stripe-reconcile.job.ts`）＝二重の安全網。

---

## 8. API エンドポイント一覧

> Hono + `@hono/zod-validator`。認証必須ルートは Supabase JWT 検証ミドルウェアを通す。お客さま系は認証なし。アクセス制御（金額は本人のみ等）は Service 層で実装。

### tip（お客さま・認証なし）
| メソッド | パス | 役割 |
|---|---|---|
| GET | `/tip/:membershipId` | 投げ銭画面の表示情報（membership から 人＋店を解決：顔写真・名前・店名・一言）。金額・履歴は返さない |
| POST | `/tip/:membershipId/intent` | 投げ銭の PaymentIntent 作成（金額・メッセージ。Direct charge は membership の店員の Stripe 口座宛、tip に staff_id＋store_id＋membership_id を pending で記録） |
| GET | `/tip/:membershipId/complete?tipId=` | 完了表示用（誰に・¥◯◯・メッセージ）。amount は当該 tip の送金額のみ |

### webhooks（認証なし・raw body）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/webhooks/stripe` | 署名検証 → 冪等性確認 → tip.status / settlement_status / staff.identity_status を更新 |

### staff（認証必須・本人スコープ）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/staff/me` | 初回プロフィール作成（display_name・headline）。本人確認なしで成立。**プロフィールは人ごと1つ** |
| POST | `/staff/me/join` | 招待コードで所属（staff_store）を追加。**新規/既存問わず参加の確定点**。既に同店所属なら `already_member` を返す（多重参加不可） |
| GET | `/staff/me` | 自分のプロフィール・identity_status・**所属店一覧（各 membership と店ごとQR用URL）** |
| GET | `/staff/me/balance` | 保留残高（held合計）・着金可能額の集計（**本人のみ・人ごと集約**） |
| POST | `/staff/me/payouts` | 送金（振込申請）。着金可能額の全額を銀行へ。最低¥100・verified必須。Stripe payout 実行＋payout記録、対象 tip を paid に |
| GET | `/staff/me/payouts` | 送金履歴（いつ・いくら・状態 pending/paid/failed・着金日。**本人のみ**） |
| GET | `/staff/me/tips` | 受取履歴（**金額・メッセージ・店ラベル含む。本人のみ**） |
| POST | `/staff/me/connect/onboard` | Stripe Connect オンボーディングリンクの発行（人ごと1回） |
| GET | `/staff/me/tax-report` | 申告データ CSV 出力（受取記録） |

### store（認証必須・店スコープ）
| メソッド | パス | 役割 |
|---|---|---|
| POST | `/store` | 店舗をセルフサーブで新規作成（店名等＋導入承認の同意。owner＝ログイン中のアカウント、adoption_agreed_at 記録）。claim は廃止 |
| GET | `/store/me` | 自分が作成した店舗を取得（未作成なら作成画面へ） |
| PATCH | `/store/:storeId` | 店舗プロフィール更新（店名・説明等） |
| POST | `/store/:storeId/invites` | スタッフ招待の発行（招待リンク/コード生成。任意の label＝誰宛メモを受ける）＝方式A |
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
- 決済UIは **Express Checkout Element（Apple Pay / Google Pay をアプリ内のネイティブ決済シートでワンタップ）＋ Payment Element（カードは埋め込み入力、PayPay 等はタップで遷移）**。リダイレクト型の Stripe Checkout は使わない。バックは PaymentIntent を作成し client_secret をフロントへ返す（Direct charge・application_fee）。カード情報は自前サーバーに通さない。Apple Pay / Google Pay を最優先表示。
- Apple Pay は HTTPS＋Apple ドメイン登録（Stripe 経由）が必要なため、ローカルでは Google Pay/カードで確認し、Apple Pay は本番ドメイン登録後に有効。PayPay は Stripe 審査後の後追い有効化。

### 金額計算（Model 層・純粋関数・Vitest 対象）
**料率モデル（手取り型）**: お客さまは投げ銭額を**そのまま**支払い（上乗せなし＝高く見せない）、手数料は**店員側から差し引く**。
- **お客さま支払額 = 投げ銭額（額面）**（上乗せ廃止。`customer_total = amount`）。
- **店員手取り ≈ 85%**（`STAFF_TAKE_RATE = 0.85`）。手数料は合計15%＝**決済料（Stripe 約3.6%）＋ 運営手数料**で構成し、店員側から引く。
- **運営手数料（application_fee）≈ 11.4%**＝ 15% − Stripe約3.6%。Direct charge では Stripe 処理手数料が Connected Account 側から引かれるため、店員手取り85%を成立させるよう application_fee を「15% − Stripe率」で算出する。
  - 例: ¥1,000 → お客さま ¥1,000 / Stripe 約¥36 / 運営 約¥114 / 店員 ¥850。
- Stripe率は日本のカードで一律3.6%前提。他決済で異なる場合、店員手取りは「約85%」と表現（実料率は本番のStripe設定で最終確認）。
- `calculatePlatformFee()`: 運営の取り分（application_fee）＝ 額面 × (0.15 − STRIPE_FEE_RATE)。
- `calculateStaffAmount()`: 店員さんの手取り ＝ 額面 × STAFF_TAKE_RATE（約85%）。
- `calculateCustomerTotal()`: お客さま支払額 ＝ 額面（上乗せなし）。後方互換のため関数は残すが上乗せ0。
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
