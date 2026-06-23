## Sprint 3: Stripe 本接続（Direct charge・Webhook・冪等性）

### 目的
Sprint 2 のモック決済を、実際の Stripe 決済に置き換える。資金移動規制を避ける肝である「運営の残高を経由しない Direct charge」を実装し、決済成立を Webhook で正として確定する。Webhook は raw body・冪等性を必ず守る。Connect オンボーディングと保留残高は Sprint 5 に切り出し、ここでは「Connected Account に直課金して succeeded を Webhook で確定する」までを完成させる。

### 実装する機能
- Stripe SDK の `infrastructure/stripe/` 隔離（client / connect / webhook / types）
- `POST /tip/:staffId/intent` を本実装: 店員さんの Connected Account への Direct charge（`application_fee_amount` で運営手数料のみ受領）
- 決済UI を Stripe Express Checkout Element（Apple Pay/Google Pay をワンタップ・ネイティブシート）＋ Payment Element（カード埋め込み）に接続し、カード情報を自前サーバーに通さない（リダイレクト型 Checkout は使わない）
- `POST /webhooks/stripe`: raw body 受信・署名検証・冪等性記録（webhook_event）・tip.status 更新
- 夜間 Cron 用の Stripe 突合ジョブ（`stripe-reconcile.job.ts`）の雛形

### スプリント契約（完了条件）
以下の全条件を満たした場合のみ、このスプリントは完了とする。

- [ ] Stripe 関連コードが `apps/api/src/infrastructure/stripe/` に隔離され、feature 層から直接 Stripe SDK を呼んでいない
- [ ] `POST /tip/:staffId/intent` が Stripe の PaymentIntent（Direct charge）を作成し、`application_fee_amount` に運営手数料が設定され、課金先が店員さんの Connected Account になっている
- [ ] Separate charges and transfers（運営が一旦受けて transfer する方式）が実装されていない（コード上に transfer 経由の着金処理が存在しない）
- [ ] フロントの決済UIが Stripe Express Checkout Element（ウォレット）＋ Payment Element（カード）をアプリ内に埋め込み、カード番号が自前 API に送信されない（ネットワークログでカード情報が自サーバーに飛ばないことを確認）。リダイレクト型 Checkout ページを経由しない
- [ ] `/webhooks/stripe` ルートが raw body のまま署名検証している（Hono の自動 JSON パースを通していない）
- [ ] 不正な署名の Webhook リクエストは 400 系で拒否される
- [ ] 正しい署名の `payment_intent.succeeded` を受けると、対応する tip の status が succeeded に更新される
- [ ] 同一 stripe_event_id の Webhook を2回送っても tip が二重更新されず、2回目は冪等に無視される（webhook_event に記録され重複スキップ）
- [ ] `payment_intent.payment_failed` を受けると tip の status が failed に更新される
- [ ] Stripe CLI（`stripe listen` / `stripe trigger`）でローカルに転送したイベントで上記の succeeded / failed / 冪等性が確認できる
- [ ] 決済成立の確定がブラウザの戻り値ではなく Webhook を起点に行われている（完了表示は succeeded 確定後に成立する）
- [ ] `stripe-reconcile.job.ts` の雛形が存在し、Stripe の決済状態と DB の tip を突合する入口（実行可能なエントリ）がある
- [ ] Sprint 2 の契約（お客さま投げ銭フローの全画面遷移）が引き続き壊れず動作する
