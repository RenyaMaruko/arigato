import type { Config } from "tailwindcss";

/**
 * Tailwind 設定。
 * /docs/design-tokens.md のトークン（色・最大幅・角丸・影・フォント）を config に登録し、
 * ユーティリティクラスとして使えるようにする。インラインスタイルや色のハードコードは禁止。
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ベース
        "app-bg": "#e9e9ec",
        page: "#ffffff",
        "surface-subtle": "#fcfcfd",
        "stamp-bg": "#f3f4f6",
        // テキスト
        ink: "#1f2024",
        "ink-label": "#3a3c42",
        "ink-sub": "#8b8e96",
        muted: "#9a9da4",
        "muted-soft": "#b6b9c0",
        lang: "#6b6e76",
        status: "#111111",
        // アクセント（ローズ）
        rose: "#ec3a6d",
        "rose-soft": "#fde8ee",
        "rose-spark": "#f7a8c4",
        // 決済
        "apple-pay": "#000000",
        "google-blue": "#4285F4",
        // ボーダー
        line: "#e6e7ea",
        "line-soft": "#ededf0",
        handle: "#e2e3e7",
        // オーバーレイ（ボトムシート背面のスクリム）
        scrim: "rgba(20, 20, 30, 0.18)",
      },
      // 端末枠の最大幅（中央1カラム・スマホアプリ風）
      maxWidth: {
        app: "430px",
      },
      // design-tokens.md の Typography（Font Sizes）をトークン化
      fontSize: {
        // XS=11 / SM=12 / Base=13 / MD=14 / LG=15 / XL=16 / 2XL=17 / 3XL=21 / 4XL=27 / Display=52
        "token-xs": "11px",
        "token-sm": "12px",
        "token-base": "13px",
        "token-md": "14px",
        "token-lg": "15px",
        "token-xl": "16px",
        "token-2xl": "17px",
        "token-3xl": "21px",
        "token-4xl": "27px",
        "token-display": "52px",
      },
      // 完了アニメ・シートのキーフレーム（Motion Design）
      keyframes: {
        sheetUp: {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(.4)", opacity: "0" },
          "60%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        spark: {
          "0%": { opacity: "0", transform: "scale(.5)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        scrimIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // 完了画面の紙吹雪が上から落ちて少し回転する（モック07）
        fall: {
          "0%": { transform: "translateY(-14px) rotate(0)", opacity: "0" },
          "30%": { opacity: "1" },
          "100%": { transform: "translateY(10px) rotate(40deg)", opacity: "1" },
        },
      },
      animation: {
        "sheet-up": "sheetUp .32s cubic-bezier(.22,1,.36,1)",
        pop: "pop .5s cubic-bezier(.22,1,.36,1)",
        spark: "spark .5s both",
        "scrim-in": "scrimIn .2s ease-out",
        // 紙吹雪の落下（個々の片に遅延を付けて散らす）
        fall: "fall .6s both",
      },
      borderRadius: {
        // design-tokens の Radius System
        DEFAULT: "12px",
        sm: "3px",
        md: "12px",
        lg: "13px",
        xl: "14px",
        "2xl": "26px",
        pill: "99px",
      },
      boxShadow: {
        // スマホ枠を地から浮かせる影
        phone: "0 0 50px rgba(20, 20, 40, 0.1)",
        // 決済ボトムシートの影
        sheet: "0 -10px 40px rgba(20, 20, 40, 0.16)",
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
