/**
 * 日本語辞書。文言はキー管理し、利用者の言語で出し分けられる構造にする。
 * Sprint 1 では基盤として最低限のキーを定義する。
 */
export const ja = {
  translation: {
    app: {
      title: "Arigato",
      tagline: "ありがとうを、その場で。",
    },
    health: {
      checking: "API と疎通中…",
      ok: "API 疎通 OK",
      error: "API 疎通に失敗しました",
    },
    tip: {
      lang: "日本語",
      san: "さん",
      selectAmount: "金額を選ぶ",
      otherAmount: "その他の金額",
      customAmountPlaceholder: "金額を入力",
      amountRange: "¥100〜¥50,000 の範囲で入力してください",
      addMessage: "メッセージを添える",
      optional: "（任意）",
      messagePlaceholder: "例）ありがとう！",
      // 投げ銭画面の送るボタン（押下で支払いシートを開く）
      send: "送る",
      loading: "読み込み中…",
      notFound: "店員さんが見つかりませんでした",
      // この QR（所属）が脱退・在籍解除済みで、いま投げ銭を受け付けていないときの案内
      notAcceptingTitle: "現在このQRは受け付けていません",
      notAcceptingNote:
        "この店員さんは現在このお店で受け付けを停止しています。再開されると、同じQRでまたお送りいただけます。",
      // 投げ銭作成時に受付停止が判明したとき（intent が membership_not_accepting を返した）
      notAcceptingError: "このQRは現在、投げ銭を受け付けていません。",
      // 支払い方法ボトムシート（アプリ内埋め込み決済）
      sheetTitle: "支払い方法を選ぶ",
      sheetClose: "閉じる",
      or: "または",
      processing: "決済中…",
      // PaymentIntent 作成中（決済 UI の準備中）
      preparingPay: "決済を準備しています…",
      // 支払い方法を選ぶシートの各ボタン
      payWithCard: "💳 カードで支払う",
      // カード入力ステップのタイトル・戻る
      cardStepTitle: "カードで支払う",
      backToMethods: "← 支払い方法に戻る",
      // カード等（Payment Element）の送る（確定）ボタン
      cardPaySubmit: "この内容で支払う",
      // 決済確定（confirmPayment）に失敗したとき
      payConfirmError: "決済に失敗しました。内容をご確認のうえ、もう一度お試しください。",
      // 完了画面
      completeTo: "さん に",
      completeDelivered: "を届けました",
      sendAgain: "もう一度送る",
      close: "閉じる",
      // 後日確定手段（PayPay 等）で受け付けたとき（confirm が processing を返したとき）。
      // 完了表示はせず「受け付けました（結果は後ほど）」として後続の確定を待つ
      paymentProcessing: "お支払いを受け付けました",
      paymentProcessingNote:
        "決済の確定までしばらくお待ちください。結果が確定するとこの画面が完了表示に切り替わります。",
      // 決済確定（Webhook を正とするため、確定待ち・失敗の状態を持つ）
      confirming: "決済を確認しています…",
      confirmingNote: "決済が成立すると、この画面が完了表示に切り替わります。",
      // 確認が長引いたとき（タイムアウト）の案内。二重送信を防ぐ文言を添える
      confirmTimeout: "確認に時間がかかっています",
      confirmTimeoutNote:
        "通信状況により確認が遅れることがあります。すでにお支払いが完了している場合があるため、もう一度送らずにお待ちいただくか、再確認してください。",
      recheck: "もう一度確認する",
      paymentFailed: "決済が成立しませんでした",
      paymentFailedNote: "お手数ですが、もう一度お試しください。",
      retry: "もう一度試す",
      // 決済開始（Checkout 作成）に失敗したとき
      payStartError: "決済を開始できませんでした。もう一度お試しください。",
    },
    // 統合ログイン／サインアップ・パスワード再設定（店員・店舗共通の唯一の認証入口）
    auth: {
      // ログイン／サインアップ画面
      loginTitle: "ログイン",
      signupTitle: "アカウント作成",
      loginLead: "メールアドレスとパスワードでログイン",
      signupLead: "メールアドレスとパスワードで新規登録",
      continueWithGoogle: "Google で続ける",
      or: "または",
      emailLabel: "メールアドレス",
      emailPlaceholder: "you@example.com",
      passwordLabel: "パスワード",
      passwordPlaceholder: "8文字以上",
      loginSubmit: "ログイン",
      signupSubmit: "アカウントを作成",
      toSignup: "アカウントをお持ちでない方はこちら",
      toLogin: "すでにアカウントをお持ちの方はこちら",
      forgotPassword: "パスワードをお忘れですか？",
      // 入力・認証のエラー
      emailEmpty: "メールアドレスを入力してください。",
      passwordEmpty: "パスワードを入力してください。",
      passwordTooShort: "パスワードは8文字以上で入力してください。",
      loginError: "ログインに失敗しました。メールアドレスとパスワードをご確認ください。",
      emailNotConfirmed:
        "メールの確認が完了していません。確認メールのリンクを開いてからログインしてください。",
      signupError: "登録に失敗しました。もう一度お試しください。",
      signupExists: "このメールアドレスは既に登録されています。ログインをお試しください。",
      // サインアップ後（メール確認の案内）
      signupSentTitle: "確認メールを送りました",
      signupSentLead:
        "メールのリンクを開くと登録が完了します。\n確認後にログインできます。",
      backToLogin: "ログインへ戻る",
      loginNote: "店の招待リンクからの登録で、所属が確定します",
      // パスワード再設定（申請）
      resetTitle: "パスワードの再設定",
      resetRequestLead: "登録したメールアドレスに、再設定用のリンクを送ります。",
      resetSubmit: "再設定メールを送る",
      resetSentLead: "メールのリンクを開いて、新しいパスワードを設定してください。",
      resetError: "送信に失敗しました。もう一度お試しください。",
      // パスワード再設定（新パスワード設定）
      newPasswordTitle: "新しいパスワードを設定",
      newPasswordLead: "新しいパスワードを入力してください。",
      newPasswordLabel: "新しいパスワード",
      newPasswordConfirmLabel: "新しいパスワード（確認）",
      newPasswordSubmit: "パスワードを変更する",
      newPasswordMismatch: "パスワードが一致しません。",
      newPasswordDoneTitle: "パスワードを変更しました",
      newPasswordDoneLead: "新しいパスワードでご利用いただけます。",
      toHome: "ホームへ",
    },
    // 店員さん画面
    staff: {
      san: "さん",
      // ログイン画面
      loginTitle: "店員さんログイン",
      loginLead: "ありがとうを受け取る準備をしましょう",
      continueWithGoogle: "Google で続ける",
      emailLabel: "メールアドレス",
      emailPlaceholder: "you@example.com",
      or: "または",
      loginNote: "店の招待リンクからの登録で、所属が確定します",
      loginError: "ログインに失敗しました。もう一度お試しください。",
      // プロフィール作成
      createTitle: "プロフィールを作成",
      createLead: "お客さまに表示される名前と一言を決めましょう",
      inviteCodeLabel: "招待コード",
      inviteCodePlaceholder: "店から受け取ったコード",
      inviteValid: "に所属します",
      inviteInvalid: "この招待は使えません（無効・使用済み・店が未承認）",
      inviteNotFound: "招待が見つかりませんでした",
      inviteChecking: "招待を確認中…",
      inviteCheckError: "招待の確認に失敗しました。もう一度お試しください。",
      // 招待受け入れ画面
      inviteTitle: "お店からの招待",
      inviteLead: "このお店の店員さんとして登録します",
      inviteStoreLabel: "所属するお店",
      inviteStart: "参加する",
      // 管理者招待（type=admin）の受け入れ表示
      inviteTitleAdmin: "管理者への招待",
      inviteLeadAdmin: "このお店の管理者として参加します",
      inviteStoreLabelAdmin: "管理するお店",
      inviteValidAdmin: "の管理者になります",
      // 参加（join）の処理中・完了・既に所属
      joining: "参加処理中…",
      joinErrorInvite: "招待が無効です。コードを確認してください。",
      joinErrorGeneric: "参加できませんでした。もう一度お試しください。",
      // 参加完了画面（「〇〇店に参加しました！」）。{{store}} に店名が入る
      joinedTitle: "{{store}} に参加しました！",
      joinedLead: "お店のQRを表示して、ありがとうを受け取りましょう",
      // 既に同じ店に所属していた場合の案内
      alreadyMemberTitle: "すでに {{store}} に所属しています",
      alreadyMemberLead: "ホームからこのお店のQRを表示できます",
      joinedGoHome: "ホームへ",
      displayNameLabel: "表示名",
      displayNamePlaceholder: "例）山田 さくら",
      headlineLabel: "一言（任意）",
      headlinePlaceholder: "例）カフェで働いています☕",
      createSubmit: "はじめる",
      // 登録処理中のボタン表示（プロフィール保存＋Stripe連結アカウント作成で数秒かかる）
      createSubmitting: "登録中…",
      createErrorInvite: "招待が無効です。コードを確認してください。",
      createErrorExists: "すでにプロフィールが作成されています。",
      createErrorGeneric: "作成に失敗しました。もう一度お試しください。",
      // 初回アカウント作成チュートリアル（welcome・2ステップの吹き出し。店員ホームで1回だけ）
      // 吹き出しに収まるよう短く。ステップ1は残高カードの本人確認ボタン付近を指す
      welcomeTutorialStep1Title: "本人確認で送金できます",
      welcomeTutorialStep1Body:
        "本人確認をすると、受け取ったチップを銀行口座へ送金できます。",
      // ステップ2: ホームの「店舗作成」タイルを指す（お店を管理する人向け）
      welcomeTutorialStep2Title: "お店の管理はこちら",
      welcomeTutorialStep2Body: "お店を管理する方は、ここから店舗を作成できます。",
      welcomeTutorialNext: "次へ",
      welcomeTutorialStart: "はじめる",
      // ホーム
      homeQr: "QRを表示",
      homeProfile: "プロフィール",
      // ホームの「店舗作成」タイル（§11.4・管理店の有無に関わらず常に表示）
      homeCreateStore: "店舗作成",
      homeWelcome: "ようこそ",
      // 所属店一覧（複数可・掛け持ち）。各店ごとにQRへ導く
      homeStoresLabel: "所属しているお店",
      homeStoreQr: "QRを表示",
      homeNoStores: "まだお店に所属していません。\n招待リンクから参加してください。",
      homeAccount: "口座登録",
      // ホームの残高カード（残高を1つにまとめて表示し、すぐ下に本人確認の導線を置く）
      homeBalanceLabel: "残高",
      // 未確認: 本人確認すれば送金できる、という一言
      homeBalanceToSendNote: "本人確認を済ませると送金できます",
      // 確認済み: 送金できる状態
      homeBalanceVerifiedNote: "送金できます",
      // 確認済み: 今すぐ送金できる額（Stripe available）。{{amount}} に金額（残りは準備中＝数日後）
      homeBalanceSendableNote: "いま送金できる額 {{amount}}（残りは準備中です）",
      // 残高のすぐ下のアクション（未確認＝本人確認へ／確認済＝残高の詳細へ）
      homeVerifyCta: "本人確認をする",
      // 本人確認の申請中（審査待ち）。状態表示＋審査期間の一言（やることは無いため導線は出さない）
      homeIdentityPendingCta: "ただいま申請中",
      homeIdentityPendingNote: "本人確認を審査中です（1〜2営業日ほどかかります）",
      // 本人確認の要対応（審査NG・追加書類）。一言＋押せるボタン（/staff/identity で修正・再提出できる）
      homeIdentityActionRequiredNote: "本人確認で追加の確認が必要です",
      homeIdentityActionRequiredCta: "追加の確認が必要です",
      homeBalanceDetailCta: "残高の詳細を見る",
      // 確認済みのホームの主アクション（送金画面へ）
      homePayoutCta: "送金する",
      identityNone: "本人確認はまだです（後でOK）",
      identityPending: "本人確認を確認中です",
      identityVerified: "本人確認済み",
      logout: "ログアウト",
      // 所属店舗（一覧画面のタイトル）
      storesTitle: "所属店舗",
      // QR（所属店舗の詳細＝店ごとのQR）
      qrTitle: "QRコード",
      qrHeading: "あなた専用の投げ銭QR",
      // 店ごとのQR であることを示すサブ見出し（{{store}} に店名）
      qrStoreSub: "{{store}} 用のQR",
      qrNote: "このQRをお客さまに見せてください",
      qrPrint: "印刷する",
      // QRを画像（PNG）として保存する（写真保存・コンビニ印刷・共有用）
      qrSaveImage: "画像として保存",
      qrUrlLabel: "QRが指すURL",
      // この店を脱退する（所属店舗の詳細＝QR画面）＋確認ダイアログ
      leaveStoreCta: "この店を脱退する",
      leaveConfirmTitle: "この店を脱退しますか？",
      // {{store}} に店名。脱退後も受取履歴で収益を確認できる旨の注意書き
      leaveConfirmBody:
        "{{store}} を脱退します。脱退すると、このお店のQRでは新しい投げ銭を受け付けなくなります。",
      leaveConfirmNote: "脱退しても、受け取った収益は受取履歴で引き続き確認できます。",
      leaveConfirmCta: "脱退する",
      leaveCancel: "キャンセル",
      leaving: "処理中…",
      leaveError: "脱退できませんでした。もう一度お試しください。",
      back: "戻る",
      // プロフィール編集
      editTitle: "プロフィール編集",
      editStoreLabel: "所属店",
      editSubmit: "保存する",
      editSaved: "保存しました",
      editError: "保存に失敗しました。もう一度お試しください。",
      // アバター画像のアップロード
      avatarChange: "顔写真を変更",
      avatarUploading: "アップロード中…",
      avatarError: "画像のアップロードに失敗しました。もう一度お試しください。",
      avatarInvalidType: "画像ファイル（PNG / JPEG / WebP）を選んでください。",
      avatarTooLarge: "画像サイズが大きすぎます（5MB まで）。",
      // ホームの導線（受取履歴・送金）
      homeHistory: "受取履歴",
      homePayout: "送金",
      // 受取履歴（04）
      tipsTitle: "受取履歴",
      tipsTotalLabel: "合計",
      // 受取サマリー（全店・全期間の累計）の2指標ラベル
      tipsTotalAmountLabel: "総受取金額",
      tipsTotalCountLabel: "総受取件数",
      tipsEmpty: "まだ受け取った投げ銭はありません",
      // フィルタ（店舗・期間）で1件も該当しないときの空表示（全体0件とは文言を分ける）
      tipsFilteredEmpty: "この条件の受取はありません",
      // 店舗・期間フィルタのラベル・選択肢
      tipsFilterStoreLabel: "店舗",
      tipsFilterAllStores: "すべての店舗",
      tipsFilterPeriodLabel: "期間",
      tipsFilterPeriodAll: "すべて",
      tipsFilterPeriodThisMonth: "今月",
      tipsFilterPeriodLastMonth: "先月",
      tipsFilterPeriodThisYear: "今年",
      // 受取履歴の取得に失敗したとき（空・ローディングと分岐）
      loadError: "受取履歴を読み込めませんでした",
      tipsSettlementHeld: "保留中",
      tipsSettlementPayable: "着金可能",
      tipsSettlementPaid: "着金済",
      tipsSettlementRefunded: "返金済",
      tipsSettlementDisputed: "異議申立",
      tipsNoMessage: "メッセージはありません",
      // 残高・ステータス（05）
      balanceTitle: "残高・ステータス",
      balanceHeldLabel: "保留残高",
      balanceHeldSub: "（本人確認前）",
      balanceHeldNote: "口座登録で着金可能になります",
      balancePayableLabel: "着金可能額",
      balancePayableSub: "（本人確認完了後）",
      balanceRegisterAccount: "口座を登録する",
      balanceSeeFlow: "本人確認の流れを見る",
      balanceVerifiedNote: "本人確認が完了しています。着金可能額をご確認ください。",
      // 手取り型の補足（店員さんに届くのは受取の約85%。手数料15%・決済料込み）
      balanceTakeNote: "金額はすべて手数料15%を引いた額です",
      // 送金（振込申請・手動送金）
      payoutTitle: "送金",
      payoutAvailableLabel: "送金できる額",
      payoutAvailableSub: "（いま登録口座へ送金できる金額）",
      // 着金タイミングの明示（数営業日）
      payoutArrivalNote: "送金すると、申請から数営業日で登録口座に着金します。",
      // 3段残高: 準備中（Stripe 確定待ち）・本人確認待ち（held）
      payoutPendingLabel: "準備中",
      payoutPendingSub: "（受け取り後、数日で送金できるようになります）",
      // {{date}} に available になる日付（例: 7月1日）。available_on が取れたときだけ出す
      payoutPendingDate: "{{date}}から送金できます",
      // 準備中の日付ごとの行ラベル（{{date}} に「M月D日」。例: 7月1日から）。日付ごとの内訳行に使う
      payoutPendingBucketDate: "{{date}}から",
      payoutHeldLabel: "本人確認待ち",
      payoutHeldSub: "（本人確認を済ませると送金できるようになります）",
      // 準備中で「送金できる額」が0のときの理由
      payoutPendingOnly: "受け取った投げ銭は準備中です。数日後に送金できるようになります。",
      // 送金ボタン・確認シート
      payoutCta: "送金する",
      payoutConfirmTitle: "送金の確認",
      // {{amount}} に送金額（例: ¥7,650）
      payoutConfirmBody: "{{amount}} を登録口座へ送金します。\n申請から数営業日で着金します。",
      payoutConfirmCta: "送金する",
      payoutCancel: "キャンセル",
      payoutSending: "送金中…",
      // {{amount}} に送金額
      // 送金完了画面（チェック演出）。{{amount}} に送金額。「閉じる」で送金画面へ戻る
      payoutDoneTitle: "{{amount}} の送金が完了しました",
      payoutDoneNote: "申請から数営業日で登録口座に着金します。",
      payoutDoneClose: "閉じる",
      // 送金できない理由
      payoutNoBalance: "送金できる残高がありません。",
      // {{min}} に最低送金額（例: ¥100）
      payoutBelowMinimum: "最低送金額（{{min}}）に達していません。",
      // verified でないとき
      payoutNeedVerify: "送金には本人確認・口座登録が必要です。",
      payoutGoVerify: "本人確認・口座登録をする",
      // エラー表示
      payoutError: "送金できませんでした。もう一度お試しください。",
      payoutErrorNotVerified: "送金には本人確認・口座登録が必要です。",
      payoutErrorBelowMinimum: "最低送金額に達していないため送金できません。",
      // 送金履歴
      payoutHistoryTitle: "送金履歴",
      payoutHistoryEmpty: "まだ送金はありません",
      payoutStatusPending: "申請中",
      payoutStatusPaid: "着金済",
      payoutStatusFailed: "失敗",
      // 本人確認の流れ（06）
      identityTitle: "本人確認・口座登録",
      identityStep1Title: "1. 基本情報の入力",
      identityStep1Sub: "お名前・生年月日など",
      identityStep2Title: "2. 本人確認書類の提出",
      identityStep2Sub: "運転免許証など",
      identityStep3Title: "3. 口座情報の登録",
      identityStep3Sub: "受け取り口座を登録",
      identityStep4Title: "4. 審査・完了",
      identityStep4Sub: "通常1〜2営業日で完了",
      identityStart: "手続きをはじめる",
      identityStarting: "リンクを準備中…",
      identityError: "手続きを開始できませんでした。もう一度お試しください。",
      // 本人確認の申請完了（07）。提出の反映（Webhook・数秒）を待ってから申請完了を出す
      identityApplying: "申請中…",
      identityApplyingNote: "申請の完了を確認しています。数秒お待ちください。",
      identityAppliedTitle: "本人確認の申請が完了しました",
      identityAppliedNote:
        "審査には1〜2営業日かかります。\n完了すると送金できるようになります。",
      // 反映が長引いたとき（断定しない。裏で確認は続けており、届き次第 申請完了へ自動で切り替わる）
      identityApplyTimeoutTitle: "確認に時間がかかっています",
      identityApplyTimeoutNote:
        "このままお待ちいただくと、確認でき次第この画面が切り替わります。手続きが途中の場合は、本人確認の画面から続きを行ってください。",
      identityApplyTimeoutResume: "手続きを再開する",
      identityCompleteGoHome: "ホームに戻る",
      // 申告データ出力（08）
      exportTitle: "データ出力",
      exportLead: "受取記録をCSVで出力できます\n確定申告にご利用いただけます",
      exportYearSuffix: "年 （1月〜12月）",
      exportDownload: "CSVをダウンロード",
      exportDownloading: "出力中…",
      exportError: "出力に失敗しました。もう一度お試しください。",
      exportLink: "申告データ（CSV）",
      // ボトムナビ（モック01）。ホーム / 履歴 / 所属店舗 / 設定
      navHome: "ホーム",
      navHistory: "受取履歴",
      navStores: "所属店舗",
      navSettings: "設定",
      // 設定画面（10）。プロフィール・本人確認/口座・申告データ・ログアウトへの導線
      settingsTitle: "設定",
      settingsProfile: "プロフィール編集",
      settingsIdentity: "本人確認・口座登録",
      settingsExport: "申告データ（CSV）",
      // 店の管理・開設への暫定導線（フェーズ1。本格的なモード切替はフェーズ3）
      settingsStoreAdmin: "店の管理・開設へ",
      // モード切替（兼任者のみ）・店の開設（管理する店が無い人）。フェーズ3の本設計
      settingsStoreManage: "店の管理へ",
      settingsStoreManageSub: "お店の管理モードに切り替える",
      settingsStoreOpen: "店を開設する",
      settingsStoreOpenSub: "あなたのお店をはじめる（オーナーになります）",
      // 共通
      loading: "読み込み中…",
    },
    // 店画面（導入承認・スタッフ管理・感謝の可視化。金額は一切表示しない）
    store: {
      san: "さん",
      // ログイン
      loginTitle: "店舗ログイン",
      continueWithGoogle: "Google で続ける",
      emailLabel: "メールアドレス",
      emailPlaceholder: "store@example.com",
      or: "または",
      loginNote: "店舗アカウントでログインしてください",
      loginError: "ログインに失敗しました。もう一度お試しください。",
      logout: "ログアウト",
      loading: "読み込み中…",
      // 店舗作成（セルフサーブ登録）
      createTitle: "お店を作成する",
      createLead: "あなたのお店の名前を入力して、\n導入承認に同意するとはじめられます。",
      createNameLabel: "店名",
      createNamePlaceholder: "例）カフェ Arigato",
      createAgreeLabel:
        "このお店で、スタッフがお客さまからチップを受け取ることに同意します。",
      createSubmit: "このお店を作成する",
      // 店舗作成の完了画面（チェック演出）。{{name}} に店名。「はじめる」で店舗管理へ入る
      createdTitle: "{{name}} を作成しました！",
      createdLead: "お店の管理をはじめましょう",
      createdStart: "はじめる",
      createError: "お店を作成できませんでした。もう一度お試しください。",
      createAlreadyExists: "このアカウントには既にお店があります。",
      // ホーム（01）
      homeBell: "通知",
      homeHeroTitle: "総投げ銭",
      homeCountSuffix: "件",
      homeWeekBadge: "今週 +{{count}} 件",
      homeRecentVoices: "最近のメッセージ",
      homeSeeAllVoices: "すべてのメッセージを見る",
      homeNoVoices: "まだ投げ銭はありません",
      // ボトムナビ
      navHome: "ホーム",
      navStaff: "スタッフ",
      navGratitude: "記録",
      navSettings: "設定",
      // 導入・承認（08）— 作成時に同意済みの記録を表示する読み取り専用画面
      approvalTitle: "導入・承認",
      approvalApprovedTitle: "導入済み",
      approvalApprovedSub: "この店舗ではサービスを\n利用中です",
      approvalCardTitle: "就業規則との整合確認",
      approvalCardBody: "お店の作成時に、就業規則との整合のため\n導入承認に同意いただいています。",
      approvalAgreedAt: "同意日：{{date}}",
      // スタッフ一覧（03）
      staffTitle: "スタッフ一覧",
      staffTabActive: "在籍中",
      staffTabInvited: "招待中",
      // 管理者タブ（owner＋admin を表示・owner はオーナーバッジ）
      staffTabAdmins: "管理者",
      staffEmpty: "まだ在籍中のスタッフはいません",
      staffInviteCta: "招待する",
      // 招待中タブの種類バッジ（スタッフ招待／管理者招待）
      invitedTypeStaffBadge: "スタッフ",
      invitedTypeAdminBadge: "管理者",
      // 管理者タブが空・読み込み中
      adminsTabEmpty: "管理者がいません",
      // スタッフ詳細（一覧の行タップ→基本情報・在籍解除）
      staffDetailTitle: "スタッフ詳細",
      staffDetailJoinedAt: "参加日：{{date}}",
      staffDetailNoHeadline: "一言は設定されていません",
      staffDetailLoadError: "スタッフ情報を読み込めませんでした",
      // スタッフ詳細での管理者操作（owner のみ・対象が管理者のとき・§11.3）
      staffDetailRemoveAdminCta: "管理者権限を外す",
      staffDetailMakeOwnerCta: "このユーザーをオーナーにする",
      staffDetailAdminSectionTitle: "管理者としての操作",
      // 在籍解除（このスタッフを外す）＋確認ダイアログ
      staffRemoveCta: "このスタッフを外す",
      staffRemoveConfirmTitle: "このスタッフを外しますか？",
      // 外しても記録・本人の収益は変わらない旨の注意書き（簡潔に）
      staffRemoveConfirmBody:
        "外しても、これまでの記録や、ご本人が受け取った収益は変わりません。",
      staffRemoveConfirmCta: "外す",
      staffRemoveCancel: "キャンセル",
      staffRemoving: "処理中…",
      staffRemoveError: "スタッフを外せませんでした。もう一度お試しください。",
      // スタッフのQR表示（詳細の「QRを表示」→ QR画面。店が印刷して置く用途）
      staffQrCta: "QRを表示",
      staffQrTitle: "QRコード",
      staffQrHeading: "スタッフ専用の投げ銭QR",
      // 誰のQRかを示すサブ見出し（{{name}} にスタッフ名）
      staffQrSub: "{{name}} さん用のQR",
      staffQrNote: "このQRをお客さまに見せてください",
      staffQrPrint: "印刷する",
      staffQrSaveImage: "画像として保存",
      staffQrUrlLabel: "QRが指すURL",
      // スタッフ招待（04）
      inviteTitle: "招待",
      inviteHeading: "スタッフを招待するための\nリンクを発行します",
      inviteLead: "このリンクから参加した人は、\nスタッフとしてこのお店に所属します。",
      // 招待の種類選択（スタッフとして／管理者として）。管理者は owner のみ選べる（§3.2）
      inviteTypeSectionLabel: "招待の種類",
      inviteTypeStaff: "スタッフとして",
      inviteTypeAdmin: "管理者として",
      inviteTypeAdminOwnerOnly: "管理者として招待できるのはオーナーだけです",
      // 招待者名（任意メモ。誰宛の招待かを見分けるため）
      inviteLabelLabel: "招待者名",
      inviteLabelPlaceholder: "例：佐藤さん",
      inviteLabelHelp: "招待中の一覧で、誰宛の招待かを見分けるためのメモです。空欄でも発行できます。",
      inviteIssue: "招待リンクを発行",
      inviteIssuing: "発行中…",
      inviteError: "招待リンクの発行に失敗しました。もう一度お試しください。",
      inviteIssuedTitle: "招待リンクを発行しました",
      inviteCopy: "リンクをコピー",
      inviteCopied: "コピーしました",
      inviteSeeList: "招待中の一覧へ",
      // 招待リンクの再コピー画面（招待中の行タップ）
      inviteResendTitle: "招待リンク",
      inviteRevoke: "この招待を取り消す",
      inviteRevoking: "取り消し中…",
      inviteRevokeError: "招待の取り消しに失敗しました。もう一度お試しください。",
      inviteNotFoundResend: "この招待は見つかりませんでした（取り消し済み・使用済みの可能性があります）",
      // 招待中の一覧（スタッフ一覧の招待中タブ）
      invitesEmpty: "招待中のスタッフはいません",
      invitesIssuedAt: "招待日：{{date}}",
      inviteStatusPending: "招待中",
      // 感謝の可視化（06）
      gratitudeTitle: "記録",
      gratitudeTabStore: "お店全体",
      gratitudeTabStaff: "スタッフ別",
      gratitudeHeroTitle: "総投げ銭",
      gratitudeCountSuffix: "件",
      // 期間セレクタ（すべて／今月／先月／今年）
      gratitudePeriodLabel: "期間",
      gratitudePeriodAll: "すべて",
      gratitudePeriodThisMonth: "今月",
      gratitudePeriodLastMonth: "先月",
      gratitudePeriodThisYear: "今年",
      gratitudeVoicesTitle: "メッセージ",
      gratitudeNoVoices: "まだ投げ銭はありません",
      // メッセージが無い投げ銭の表示
      gratitudeNoMessage: "メッセージなし",
      gratitudePerStaffTitle: "スタッフ別の「ありがとう」",
      gratitudePerStaffNote: "（名簿順・件数で順位はつけません）",
      gratitudeNoStaff: "スタッフがいません",
      gratitudePerStaffCount: "{{count}} 件",
      // スタッフ別タブのスタッフ選択（ドロップダウン）
      gratitudeStaffLabel: "スタッフ",
      gratitudeStaffAll: "すべて",
      // 特定スタッフ選択時にメッセージが無いときの表示
      gratitudeStaffNoVoices: "この期間のメッセージはありません",
      // 設定（07）
      settingsTitle: "設定",
      settingsProfile: "店舗プロフィール",
      settingsStaff: "スタッフ招待・管理",
      settingsAdmins: "管理者",
      settingsApproval: "導入・承認",
      // モード切替（店の管理→店員モード）。店の管理は兼任者のみ到達するため常に出してよい
      settingsStaffMode: "店員モードへ",
      settingsStaffModeSub: "自分の受け取り・QR の画面に切り替える",
      // 管理者一覧・招待・削除・owner 譲渡・owner 離脱・閉店（フェーズ3）
      adminsTitle: "管理者",
      adminsLead: "このお店を管理する人たちです",
      adminsOwnerBadge: "オーナー",
      adminsAdminBadge: "管理者",
      // 一覧で閲覧者自身の行に添えるラベル（在籍中タブ・管理者タブ共通）
      adminsSelf: "（自分）",
      adminsNoName: "名前未設定",
      adminsInviteCta: "管理者を招待する",
      adminsLoadError: "管理者を読み込めませんでした",
      // 管理者を外す（owner のみ）
      adminsRemoveCta: "外す",
      adminsRemoveConfirmTitle: "この管理者を外しますか？",
      adminsRemoveConfirmBody: "外すと、この人はお店の管理ができなくなります。受け取り・記録には影響しません。",
      adminsRemoveConfirmCta: "外す",
      adminsRemoveCancel: "キャンセル",
      adminsRemoving: "処理中…",
      adminsRemoveError: "管理者を外せませんでした。もう一度お試しください。",
      // owner 譲渡（owner のみ・対象 admin を選ぶ）
      adminsTransferCta: "オーナーを譲渡",
      adminsTransferConfirmTitle: "オーナーを譲渡しますか？",
      adminsTransferConfirmBody: "「{{name}}」をこのお店のオーナーにします。あなたは管理者になります。",
      adminsTransferConfirmCta: "譲渡する",
      adminsTransferring: "処理中…",
      adminsTransferError: "オーナーを譲渡できませんでした。もう一度お試しください。",
      // owner が店から抜ける・店を閉じる（owner のみ・危険な操作）
      adminsDangerTitle: "オーナーの操作",
      adminsLeaveCta: "オーナーを退任して抜ける",
      adminsLeaveConfirmTitle: "オーナーを退任しますか？",
      adminsLeaveConfirmBody:
        "他に管理者がいれば、最も古い管理者が自動でオーナーになります。管理者がいなければお店は閉店します。",
      adminsLeaveConfirmCta: "退任する",
      adminsLeaving: "処理中…",
      adminsLeaveError: "退任できませんでした。もう一度お試しください。",
      adminsCloseCta: "お店を閉じる（閉店）",
      adminsCloseConfirmTitle: "お店を閉じますか？",
      adminsCloseConfirmBody:
        "閉店するとQR・所属は無効になります。これまでの記録や、スタッフが受け取った収益は残ります。",
      adminsCloseConfirmCta: "閉店する",
      adminsClosing: "処理中…",
      adminsCloseError: "閉店できませんでした。もう一度お試しください。",
      // 管理者招待（リンク発行・owner のみ）
      adminInviteTitle: "管理者を招待",
      adminInviteHeading: "管理者を招待するための\nリンクを発行します",
      adminInviteLead: "このリンクから参加した人は、\n管理者としてこのお店に所属します。",
      adminInviteError: "招待リンクの発行に失敗しました。もう一度お試しください。",
      settingsNotifications: "通知設定",
      settingsFaq: "よくある質問",
      settingsContact: "お問い合わせ",
      settingsTerms: "利用規約",
      settingsPrivacy: "プライバシーポリシー",
      // 店舗プロフィール（02）
      profileTitle: "店舗プロフィール",
      profileNameLabel: "店名",
      profileNameRequired: "（必須）",
      profileNamePlaceholder: "例）カフェ Arigato",
      profileDescriptionLabel: "店舗紹介",
      profileDescriptionPlaceholder: "例）心地よい時間と、感謝がめぐるお店を目指しています。",
      profileIndustryLabel: "店舗の業種",
      profileIndustryPlaceholder: "例）カフェ・喫茶",
      profileSave: "保存する",
      profileSaving: "保存中…",
      profileSaved: "保存しました",
      profileError: "保存に失敗しました。もう一度お試しください。",
      // ロゴ画像のアップロード
      logoChange: "店舗ロゴを変更",
      logoUploading: "アップロード中…",
      logoError: "画像のアップロードに失敗しました。もう一度お試しください。",
      logoInvalidType: "画像ファイル（PNG / JPEG / WebP）を選んでください。",
      logoTooLarge: "画像サイズが大きすぎます（5MB まで）。",
      // 共通
      back: "戻る",
    },
    // ボトムナビ中央の「店舗管理 ⇄ 店員」切替（§11.4・店員側/店側の両ナビ共通）
    mode: {
      // 店員モードのラベル・aria（押すと店の管理へ）
      toStore: "店舗管理",
      // 管理モードのラベル・aria（押すと店員モードへ戻る）
      toStaff: "店員",
      // 管理店が複数のときの選択シート見出し
      selectStoreTitle: "管理するお店を選ぶ",
      // 選択シートで自分がオーナーの店に付けるバッジ
      ownerBadge: "オーナー",
      // シートを閉じる（スクリムの aria）
      close: "閉じる",
      // 初回のみのチュートリアル（コーチマーク）
      tutorialTitle: "ここで切り替え",
      tutorialBody: "この中央のボタンで、店員モードとお店の管理モードを切り替えられます。",
      tutorialGotIt: "わかりました",
    },
  },
} as const;
