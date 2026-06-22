## Sprint 4: 店員さんアカウントと QR 発行（本人確認なしで到達）

### 目的
店員さんが「重い手続きの前に価値を体験する」入口を作る。Supabase Auth でアカウント作成し、本人確認・口座登録なしで個人QRの発行まで到達させる。この QR が Sprint 2/3 の `/tip/:staffId` に繋がり、投げ銭が「届く」体験が成立する。受取履歴・保留残高・本人確認は Sprint 5 に切り出す。

### 実装する機能
- Supabase Auth（Google / メール）でのサインアップ・ログイン（フロント `lib/auth.ts`、バック Supabase JWT 検証ミドルウェア jose）
- 初回プロフィール作成 `POST /staff/me`（display_name・headline・所属 store 紐付け）。本人確認なしで成立
- `GET /staff/me`（自分のプロフィール・identity_status・QR用URL）
- 店員さんホーム（ログイン後の起点）
- 個人QR の発行画面（`/tip/:staffId` を指す QR、印刷できる形）

### スプリント契約（完了条件）
以下の全条件を満たした場合のみ、このスプリントは完了とする。

- [ ] 店員さんが Google またはメールで Supabase Auth 経由のアカウント作成・ログインができる
- [ ] バックの認証必須ルートが Supabase JWT を jose で検証し、無効・欠落トークンは 401 を返す
- [ ] ログイン後、初回はプロフィール作成画面が表示され、display_name・headline・所属店を入力して `POST /staff/me` で staff レコードが作成される
- [ ] プロフィール作成時に本人確認・口座登録・Stripe Connect 連携を一切求められない（未連携 = identity_status が none のまま成立する）
- [ ] `GET /staff/me` が自分のプロフィール（display_name・headline・identity_status・QR用URL）を返す
- [ ] 店員さんホームに自分の表示名・一言が表示される
- [ ] QR発行画面で自分の `/tip/:staffId` を指す QRコードが表示される
- [ ] 表示された QR を読み取る（または同URLを開く）と Sprint 2 の投げ銭画面 `/tip/:staffId` が開き、その店員さんの名前・店名・一言が表示される
- [ ] QR は印刷を想定した表示（QR 画像が十分な解像度で、名前など最小限の案内とともに出力できる）になっている
- [ ] 他人の `/staff/me` 情報を取得できない（自分のスコープのデータのみ返る）ことが確認できる
- [ ] 店員さん画面が最大幅 430px・中央1カラムで表示される
- [ ] Sprint 2/3 のお客さま投げ銭フローが、実在する staff の QR から成立する（モックの staffId でなく実データで通る）
