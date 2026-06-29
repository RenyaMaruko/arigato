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
      payWithPaypay: "PayPay で支払う",
      // PayPay は Stripe 審査前で未有効のため、案内文言を出して無効化する
      paypayComingSoon: "準備中",
      paypayNotReady: "PayPay は現在ご利用いただけません。カードまたはウォレットでお支払いください。",
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
    // 店員さん画面
    staff: {
      san: "さん",
      // ログイン画面
      loginTitle: "店員さんログイン",
      loginLead: "ありがとうを受け取る準備をしましょう",
      continueWithGoogle: "Google で続ける",
      emailLabel: "メールアドレス",
      emailPlaceholder: "you@example.com",
      sendMagicLink: "メールでログインリンクを送る",
      magicLinkSent: "ログイン用のリンクをメールに送りました。メールを確認してください。",
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
      createNote: "本人確認・口座登録は後からで大丈夫です",
      createErrorInvite: "招待が無効です。コードを確認してください。",
      createErrorExists: "すでにプロフィールが作成されています。",
      createErrorGeneric: "作成に失敗しました。もう一度お試しください。",
      // ホーム
      homeQr: "QRを表示",
      homeProfile: "プロフィール",
      homeWelcome: "ようこそ",
      // 所属店一覧（複数可・掛け持ち）。各店ごとにQRへ導く
      homeStoresLabel: "所属しているお店",
      homeStoreQr: "QRを表示",
      homeNoStores: "まだお店に所属していません。招待リンクから参加してください。",
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
      payoutHeldLabel: "本人確認待ち",
      payoutHeldSub: "（本人確認を済ませると送金できるようになります）",
      // 準備中で「送金できる額」が0のときの理由
      payoutPendingOnly: "受け取った投げ銭は準備中です。数日後に送金できるようになります。",
      // 送金ボタン・確認シート
      payoutCta: "送金する",
      payoutConfirmTitle: "送金の確認",
      // {{amount}} に送金額（例: ¥7,650）
      payoutConfirmBody: "{{amount}} を登録口座へ送金します。申請から数営業日で着金します。",
      payoutConfirmCta: "送金する",
      payoutCancel: "キャンセル",
      payoutSending: "送金中…",
      // {{amount}} に送金額
      payoutDone: "{{amount}} を送金しました。数営業日で着金します。",
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
      // 本人確認完了（07）
      identityCompleteTitle: "本人確認が完了しました！",
      identityCompleteSub: "保留残高が着金可能になりました",
      identityCompleteAmountLabel: "着金可能額として利用できます",
      identityCompletePending: "本人確認の手続きを確認しています…",
      identityCompletePendingNote: "完了が反映されると、この画面が切り替わります。",
      identityCompleteSeeBalance: "残高を確認する",
      identityCompleteSeeHistory: "履歴を見る",
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
      sendMagicLink: "メールでログインリンクを送る",
      magicLinkSent: "ログイン用のリンクをメールに送りました。メールを確認してください。",
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
        "このお店で投げ銭を導入することに同意します（就業規則との整合は店舗側で確認します）。",
      createSubmit: "このお店を作成する",
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
      staffEmpty: "まだ在籍中のスタッフはいません",
      staffInviteCta: "スタッフを招待する",
      // スタッフ詳細（一覧の行タップ→基本情報・在籍解除）
      staffDetailTitle: "スタッフ詳細",
      staffDetailJoinedAt: "参加日：{{date}}",
      staffDetailNoHeadline: "一言は設定されていません",
      staffDetailLoadError: "スタッフ情報を読み込めませんでした",
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
      // スタッフ招待（04）
      inviteTitle: "スタッフ招待",
      inviteHeading: "スタッフを招待するための\nリンクを発行します",
      inviteLead: "このリンクから新規登録したスタッフは、\n自動でこのお店に所属します。",
      // 招待者名（任意メモ。誰宛の招待かを見分けるため）
      inviteLabelLabel: "招待者名",
      inviteLabelPlaceholder: "例：佐藤さん／ホール担当",
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
      settingsApproval: "導入・承認",
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
  },
} as const;
