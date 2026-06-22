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
      selectStamp: "スタンプを選ぶ",
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
    },
  },
} as const;
