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
      addMessage: "メッセージを添える",
      optional: "（任意）",
      messagePlaceholder: "例）ありがとう！",
      payWithApplePay: " Pay で送る",
      payWithGooglePay: "Pay で送る",
      secureNote: "🔒 安全な決済で、満額が届きます",
      loading: "読み込み中…",
      notFound: "店員さんが見つかりませんでした",
      // 支払い方法ボトムシート
      sheetTitle: "支払い方法を選ぶ",
      sheetClose: "閉じる",
      applePay: " Pay",
      googlePay: "Pay",
      cardPay: "💳 カードで支払う",
      or: "または",
      processing: "決済中…",
      // 完了画面
      completeTitle: "ありがとうを\n届けました！",
      completeTo: "さん に",
      completeDelivered: "を届けました",
      sendAgain: "もう一度送る",
      close: "閉じる",
      // 決済確定（Webhook を正とするため、確定待ち・失敗の状態を持つ）
      confirming: "決済を確認しています…",
      confirmingNote: "決済が成立すると、この画面が完了表示に切り替わります。",
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
      inviteStart: "はじめる",
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
      identityNone: "本人確認はまだです（後でOK）",
      identityPending: "本人確認を確認中です",
      identityVerified: "本人確認済み",
      logout: "ログアウト",
      // QR
      qrTitle: "QRコード",
      qrHeading: "あなた専用の投げ銭QR",
      qrNote: "このQRをお客さまに見せてください",
      qrPrint: "印刷する",
      qrUrlLabel: "QRが指すURL",
      back: "戻る",
      // プロフィール編集
      editTitle: "プロフィール編集",
      editStoreLabel: "所属店",
      editSubmit: "保存する",
      editSaved: "保存しました",
      editError: "保存に失敗しました。もう一度お試しください。",
      // 共通
      loading: "読み込み中…",
    },
  },
} as const;
