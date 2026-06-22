## Sprint 5: 保留残高・本人確認・受取履歴（金額は本人のみ）

### 目的
「体験を登録の前に」の核を完成させる。本人確認前に届いた投げ銭を保留残高（未着金）として安全に保持し、Stripe Connect オンボーディング完了の Webhook をトリガーに着金可能へ遷移させる。あわせて店員さんが受取履歴・メッセージを見られるようにし、「金額は本人のみ」を Service 層で徹底する。

### 実装する機能
- Stripe Connect オンボーディング `POST /staff/me/connect/onboard`（オンボーディングリンク発行 → 戻り）
- Webhook `account.updated` 処理: staff.identity_status と tip.settlement_status の遷移
- 保留残高モデル: tip.settlement_status（held / payable / paid）と Model 純粋関数 `canPayout()`
- 受取履歴 `GET /staff/me/tips`（金額・メッセージ・文脈、本人のみ）
- 保留残高サマリ `GET /staff/me/balance`（held 合計・着金可能額、本人のみ）
- 申告データ出力 `GET /staff/me/tax-report`（受取記録の CSV）

### スプリント契約（完了条件）
以下の全条件を満たした場合のみ、このスプリントは完了とする。

- [ ] 本人確認前（identity_status = none / pending）の店員さんでも投げ銭が成立し、その tip の settlement_status が held（保留）として記録される
- [ ] `POST /staff/me/connect/onboard` が Stripe Connect オンボーディングへのリンクを発行し、店員さんがそこへ遷移できる
- [ ] `account.updated`（payouts_enabled = true）の Webhook を受けると staff.identity_status が verified に遷移する
- [ ] identity_status が verified に遷移した時点で、その店員さんの held の tip が payable（着金可能）へ遷移する
- [ ] Model の `canPayout()` に Vitest テストがあり、identity_status ごとの着金可否判定がパスする
- [ ] `GET /staff/me/balance` が保留残高（held 合計）と着金可能額を本人に返す
- [ ] `GET /staff/me/tips` が自分の受取履歴を金額・メッセージ・受取日時つきで返す
- [ ] 他人の `/staff/me/tips` `/staff/me/balance` は取得できず、金額が他人へ漏れない（Service 層で本人スコープに制限されていることを確認）
- [ ] 受取履歴画面に各投げ銭の金額・メッセージ・いつ受け取ったかが表示される
- [ ] `GET /staff/me/tax-report` が受取記録の CSV を出力し、少なくとも 受取日 / 金額 / 店名 の列を含む
- [ ] account.updated の Webhook が冪等であり、同一イベント再送で状態が二重遷移しない
- [ ] 本人確認の遷移が成立しても、店（store）向けの取得経路には金額が一切現れない（Sprint 6 で検証する原則をこの時点でも破らない）
