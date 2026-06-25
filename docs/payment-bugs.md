# 決済・送金まわりで起きたバグ記録

投げ銭（決済）・送金（payout）まわりで実際に発生した不具合と、その原因・修正・再発防止をまとめる。
お金に関わる箇所なので、同種の問題を繰り返さないための記録として残す。

凡例：**[修正済]** コード修正で解消／**[要対応]** 設計上の課題で未完／**[運用注意]** コードではなく環境・テストデータ起因。

---

## 1. [修正済] 完了画面が永久ロードになる（決済の確定待ち）

- **症状**：投げ銭の決済後、完了画面が「決済を確認しています…」のまま無限に回り続け、お客さまが成功したか分からない。
- **原因**：
  - 完了表示を **Webhook（payment_intent.succeeded）到着まで待つ**設計だったため、
    - `stripe listen`（Webhook転送）が動いていない／遅延すると確定せず無限ループ。
    - そもそも決済が成立していない（`requires_payment_method`）場合も、`failed` にもならずスピナーが回り続けた。
  - 失敗・タイムアウトの逃げ道が無かった。
- **修正**：
  1. まず完了画面に **30秒タイムアウト**を追加（永久ロード回避・「確認に時間がかかっています」＋再確認/閉じる）。
  2. 根本対応として**案2（confirmPayment の即時結果ベース表示）**を導入：お客さま向けの成功/失敗は**決済処理の結果でその場で表示**し、Webhook は裏のサーバー確定（残高・記録）に専念。永久ロードの構造的原因を解消。
- **教訓**：お客さま向けの「成功/失敗表示」を**サーバー通知（Webhook）に同期させない**。表示はクライアントの決済結果、残高・着金の確定はWebhook、と**正を2段構え**にする。

---

## 2. [修正済] 送金の整合性バグ（Stripe送金成功なのにDB未記録＝二重送金リスク）★重大

- **症状**：店員が「送金する」を押すと、UIは「送金できませんでした」と表示。しかし **Stripe では payout が成功**（status=paid・実際に出金）しており、DB には送金記録が無く tip は `payable` のまま残った → **もう一度押すと二重送金**になり得る状態。
- **原因**（2点）：
  1. **配列バインドの実SQL失敗**：`UPDATE tip ... WHERE id = ANY(${tipIds})` が実DB（drizzle + postgres-js）で失敗。postgres-js はJS配列を「行(record)」に展開するため `= ANY(配列)` が型エラー。`::uuid[]` を単純付与しても `cannot cast record to uuid[]`。**メモリ実装ではこの問題が出ずテストをすり抜けた**。
  2. **非アトミックな順序**：「Stripe送金 → その後DB記録」の順で、後段DBが失敗してもStripe送金が取り消されなかった。
- **修正**：
  - **DB先行**：payout(pending)作成＋tip→paid を**先にトランザクション**で実行。失敗すればStripeを呼ばない（お金を動かさない）。
  - Stripeは **`idempotency_key`＋`metadata.payout_id`（自前payout行id）付き**で実行。成功で `stripe_payout_id` 補完、**失敗で revert**（payout=failed＋tipをpayableへ戻す）。
  - 配列バインドを **`= ANY(${literal}::uuid[])`** に修正（空配列も安全）。
  - Webhook `payout.paid/failed` を **`stripe_payout_id`＋`metadata.payout_id` の両方で照合**（stripe_id補完前に落ちても確定可能）。
- **教訓**：
  - **外部API（送金）成功 → ローカルDB書き込み の順は危険**。お金を動かす前にDBを確定し、外部呼び出しは idempotency_key で冪等化、失敗時は revert。
  - **メモリ実装のテストだけでは実SQL（配列バインド等）の不具合を検知できない**。お金に関わるRepositoryは実DBでのE2E検証を行う。

---

## 3. [修正済] payout.paid 反映時の Date バインドエラー

- **症状**：`payout.paid` Webhook 受信時にサーバーが 500 エラー。
- **原因**：`markPayoutPaid` が `Date` オブジェクトを直接 SQL バインドに渡し、postgres-js が `ERR_INVALID_ARG_TYPE`。
- **修正**：`.toISOString()::timestamptz` で渡すように修正。
- **教訓**：postgres-js への日時バインドは ISO 文字列＋明示キャストで渡す。

---

## 4. [修正済] 多対多移行時に決済データ表示が壊れた

- **症状**：店のスタッフ一覧・感謝の可視化が実行時に壊れる（クラッシュ）。
- **原因**：店員の多対多所属（掛け持ち）対応で `staff.store_id` を撤去したのに、`store.repository` の `listStaff`/`listGratitudePerStaff` が**撤去済みカラム `staff.store_id` を参照**していた。
- **修正**：`staff_store`（membership）経由のJOINに書き換え。件数は `tip.store_id` でその店分のみ集計（金額は出さない＝横断ルール維持）。
- **教訓**：スキーマからカラムを撤去したら、**生SQLの全参照を grep で洗い出す**（型では拾えない）。

---

## 5. [修正済] DBの「着金可能額」と Stripe の「実際に送金できる残高」がズレる

- **症状**：送金画面の着金可能額（例 ¥117,582）に対し、Stripe の利用可能(available)残高は少額（例 ¥4,980）しか無く、送金が残高不足で失敗し得る。
- **原因**：
  - DB は「verified になったら payable」と**即マーク**するため着金可能額が大きく出る。
  - 一方 Stripe は、受け取った資金を**数日 pending→available に確定**させる。直近の投げ銭はまだ送金可能になっていない。
  - アプリは **DBのpayable合計**を送金しようとするため、Stripe実残高を超えると失敗する。
- **修正**：
  - **送金可能額・送金額の「正」を Stripe の実 available 残高にした**（DB の payable 合計ではない）。infrastructure に `retrieveConnectBalance`（`balance.retrieve({ stripeAccount })` の available[jpy]／pending[jpy]／pending の最早 `available_on`）を追加し、Service へ注入（4層分離）。
  - **残高API（`GET /staff/me/balance`）を3段**に：送金できる額（verified かつ Stripe available）／準備中（Stripe pending・`available_on` から「◯月◯日から送金できます」）／本人確認待ち（held）。受取総額（DB held+payable+paid）は引き続き見せる（隠さない）。Stripe 取得失敗時は DB 集計で代替し画面を壊さない。
  - **送金実行（`POST /staff/me/payouts`）は申請時点の Stripe available を再取得（TOCTOU 回避）**し、payable な tip を**古い順（FIFO）に available へ収まる範囲だけ**選んで送金（`selectPayoutTipsWithinAvailable`）。送金額は必ず available 以下＝**残高不足を構造的に回避**。available に収まらない pending 分の tip は payable のまま残し、available になってから次回送金。
  - **前回の送金整合性対策（#2）は後退させない**：DB 先行（pending 行作成＋選んだ tip を paid 化）→ Stripe payout（idempotency_key・metadata.payout_id）→ 成功で stripe_payout_id 補完／失敗で revert。確定は payout.paid/failed Webhook を正とする。
- **検証**：実 DB + 実 Stripe で E2E。available（即時着金カード）と pending（通常カード）を混在させた verified 店員で、残高が「送金できる(available 4430)／準備中(pending 7088・◯月◯日)／本人確認待ち(held)」に分かれ、**送金は available 分だけ成功**（payout.paid Webhook で paid 確定）、pending 分は payable のまま残ることを確認。テストデータ・連結アカウントは検証後に削除。
- **教訓**：受取（DB上の権利）と、実際に**払い出せる残高（Stripe側の settlement）**は別物。送金可能額は Stripe 残高を正にし、送金額は available を上限にキャップする。

---

## 6. [対応済/設計変更] 店員が満額を受け取れていなかった（料率の取りこぼし）

- **症状（設計バグ）**：要件は「店員は満額・手数料はお客さま上乗せ」だが、実装では**上乗せが運営手数料(10%)しかカバーせず、Stripe処理手数料(約3.6%)が店員側から引かれて**いた（¥1,000で店員¥960）。
- **原因**：Direct charge では Stripe処理手数料が Connected Account（店員）側から引かれる。上乗せ額の設計がこれを織り込んでいなかった。
- **対応**：料率モデルを見直し、**手取り型（お客さまは額面ぴったり・店員手取り約85%・手数料15%は決済料込みで店員側から差引）**に変更。`STAFF_TAKE_RATE`/`STRIPE_FEE_RATE`/`PLATFORM_FEE_RATE` を定義。
- **教訓**：Direct charge の手数料は**誰の残高から引かれるか**を必ず確認し、満額/取り分の前提を数値で検算する。

---

## 7. [運用注意] Stripe アカウントの不一致（CLI / MCP と .env サンドボックス）

- **症状**：`stripe listen` や Stripe CLI/MCP の操作が、`.env` のサンドボックス（連結アカウントが存在するアカウント）と**別アカウント**を向いていて噛み合わない。
- **対応**：CLI は `--api-key "$STRIPE_SECRET_KEY"` を明示。連結アカウントの確認・操作は **`.env` の秘密鍵で curl/API** を使う（MCP は別アカウントの可能性があるので避ける）。
- **教訓**：Stripe 操作は**どのアカウントに対してか**を常に意識。サンドボックス操作は `.env` 鍵を正にする。

---

## 8. [修正済] 未オンボーディングの連結アカウントには直課金できない（staff_not_chargeable）★体験を登録の前に

- **症状**：本人確認前の店員に投げ銭すると `staff_not_chargeable`（「決済を開始できませんでした」）。連結アカウントは**オンボーディング開始時にしか作られず**、プロフィール作成だけでは未作成だった。
- **原因**：Direct charge は課金先の Connected Account が **`charges_enabled`** である必要がある。プロフィール作成時に連結アカウントを作っていなかったため、未オンボーディングの店員は課金口が無く弾かれていた。「体験を登録の前に（本人確認は後ろ倒し）」と矛盾していた。
- **修正**：**連結アカウントをプロフィール作成（`POST /staff/me`）時に自動作成**するようにした（`createStaffProfile` Service に `createConnectedAccount` を注入。入口が招待リンクでも `/staff` 直アクセスでも同じ経路を通るため両方カバー。既に連結済みなら再作成しない＝冪等。作成失敗してもプロフィール作成は壊さずログのみ）。
- **charges_enabled をどう満たすか（重要な作法）**：
  - **`controller.requirement_collection: "application"` ＋ `stripe_dashboard.type: "none"`** で作成する（この組み合わせのときだけ、運営が API で本人情報・銀行口座・**利用規約同意（tos_acceptance）を代理投入（prefill）**できる）。
  - `requirement_collection: "stripe"`（Stripe ホスト型オンボーディング相当）では **運営が ToS を代理同意できず**（`You cannot accept the Terms of Service on behalf of accounts where controller[requirement_collection]=stripe`）、ホスト画面を通すまで `charges_enabled` にならない。そのため「前倒しで受け取れる」を満たすには application 側を選ぶ必要がある。
  - 作成直後に **JP individual のテスト用 prefill**（business_profile.mcc/url/product_description、漢字＋カナの代表者情報、テスト銀行口座、tos_acceptance）を投入すると、テストモードでは即 `card_payments`/`transfers` capability が active になり **`charges_enabled=true`** になる。
  - **`account_holder_name` はカナ／英字のみ**許可（漢字を含む表示名を渡すと `The account holder name may contain only katakana or alphabetical characters` で失敗）。テスト prefill ではカナの固定ダミーを使う。
- **受け取りと送金の分離**：上記 prefill 後も **`payouts_enabled=false`**（`requirements.currently_due` に `individual.verification.document` が残る）。送金（payout）は本人確認完了（`account.updated` の `payouts_enabled=true` Webhook）後に解禁する設計を維持。受け取り（charges）は前倒し・送金（payouts）は後ろ倒し。
- **教訓**：「課金可能な連結アカウントを前倒しで用意する」には controller の **requirement_collection を application に**して運営が ToS 同意・本人情報を prefill する必要がある。Express（stripe 収集）のままでは API 単独で chargeable にできない。

---

## 9. [運用注意] 突合ジョブの「No such payment_intent」

- **症状**：`stripe-reconcile.job.ts` 実行時に多数の `No such payment_intent`。
- **原因**：テスト中に店員の `stripe_account_id` を何度も差し替えたため、古い tip の PaymentIntent が**実在しない連結アカウント**を参照していた（テストデータの汚染）。コードの不具合ではない。
- **教訓**：連結アカウントの差し替えはテストデータを不整合にする。検証後は**口座差し替え・シードデータを元に戻す**運用を徹底する。

---

## 10. [修正済] 認証で画面が固まる（無限ローディング・「参加処理中」固まり）★重大

- **症状**：ログイン後の `/staff`・`/store` が無限ローディングになる／店員参加（join）が「参加処理中」のまま固まる／リロードで固まる。お客さま投げ銭（/tip・認証不要）には影響なし。
- **原因**（2系統）：
  1. **auth-js の Web Locks 孤立ロック（恒久対応の本丸）**：`supabase.auth.getSession()/getUser()` は navigator Web Locks（`lock:sb-…-auth-token`）を取りに行くが、孤立ロックでデッドロックし**永久ハング**する既知不具合（supabase issue #1594/#2111/#1517/#762、discussions/19058）。トリガは React StrictMode の dev 二重マウント・abort・`onAuthStateChange` 内の async 呼び出し・毎時のトークン更新など（マルチタブが主因ではない）。**API クライアントが毎リクエスト `getSession()` を呼んでいた**ため、ロック競合の入口が多かった。
  2. **参加（join）の二重発火**：プロフィール作成成功時、`useStaffMe` の `setQueryData` が先に走って `hasProfile=true` になり自動参加 `useEffect` が join を撃つ一方、作成の `onSuccess` でも join を撃つ。**単発招待のため2回目が 409（invite_not_usable）**になり、ガードがローディング表示のまま固まった（メモリ保持化で token 取得が同期になりタイミングが変わって顕在化）。
- **修正**：
  1. **セッションをモジュールレベルでメモリ保持**（`apps/web/src/lib/auth.ts`）。`onAuthStateChange` で **INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT** を**同期的に**反映（コールバック内で await する Supabase 呼び出しはしない＝デッドロック回避）。`getAccessToken()` はメモリの `access_token` を**同期返却**し、API クライアント（`api-client.ts`）・CSV ダウンロード（`staff.api.ts`）はこれを使う。`useAuthSession` も同じメモリセッションを購読し、`getSession()` の直接呼び出しは初回ブートストラップのみに最小化。
  2. **navigator.locks をバイパス**：`createClient(..., { auth: { lock: noOpLock } })` で Web Locks を無効化（`const noOpLock = async (_name, _timeout, fn) => fn();`）。ロックのデッドロックを構造的に根絶する。トレードオフ＝複数タブ同時刷新で片方がサインアウトし得る点はコード内コメントに明記。
  3. **初回ブートストラップにタイムアウト保険**（3秒）：`getSession()` が返らなくても loading を必ず解除（最悪ログイン画面へ）。固まり耐性を担保。
  4. **鮮度維持（自動ログイン不変）**：`persistSession`/`autoRefreshToken`/`detectSessionInUrl` は維持。`autoRefreshToken` が裏で更新し `TOKEN_REFRESHED` でメモリセッションを差し替えるため、再ログイン不要のまま常に新鮮なトークンを使う。
  5. **join の単発化**：`StaffProfileCreatePage` の `runJoin` に**同期ガード（`useRef`）**を入れ、自動参加 `useEffect` と作成 `onSuccess` のどちらから来ても join は1回だけ。参加が失敗したときはローディングのまま固まらせず**ホームへ送る**（プロフィールは作成済み＝後から招待リンクで再参加可能）。
- **教訓**：
  - **認証セッションはメモリ保持を正にし、毎リクエスト `getSession()` を呼ばない**（公式ベストプラクティス。ロック競合の入口を増やさない）。トークンの鮮度は `autoRefreshToken`＋`TOKEN_REFRESHED` で保つ。
  - **`onAuthStateChange` のコールバックは同期で state 更新のみ**にする（await する Supabase 呼び出しでデッドロックを誘発しない）。
  - **起動時セッション取得は必ずタイムアウトで loading を解除**できるようにする（外部要因で返らなくても固まらせない）。
  - **冪等でない確定操作（単発招待の join 等）は同期ガードで二重発火を防ぐ**。非同期の `setState` フラグはレンダー前の二重実行を防げない（`useRef` で同期に弾く）。

---

## まとめ：再発防止の原則

1. **お客さま表示＝決済の即時結果／お金の確定＝Webhook**（2段の正）。表示をWebhook待ちにしない。
2. **外部送金の前にDBを確定**し、外部呼び出しは idempotency 化、失敗時は revert。「外部成功×DB失敗」を構造的に作らない。
3. **お金のRepositoryは実DBでE2E検証**（メモリ実装のテストだけに頼らない。特に配列・日時バインド）。
4. **送金可能額は Stripe の実 available 残高を正**にする（DBのpayableと混同しない）。送金額は available を上限にキャップし、残高不足を構造的に回避する（5番＝対応済み）。
5. **手数料は誰の残高から引かれるかを数値で検算**（Direct charge の Stripe手数料は店員側）。
6. **認証セッションはメモリ保持＋no-opロック＋initタイムアウト**で固まりを構造的に防ぐ。毎リクエスト `getSession()` を呼ばず、`onAuthStateChange` は同期 state 更新のみ。自動ログイン（持続性）は `persistSession`/`autoRefreshToken` 維持で不変。
6. **Stripe操作は対象アカウントを常に確認**（サンドボックスは .env 鍵）。
