import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { ja } from "./ja.js";

/**
 * react-i18next の初期化。
 * 初期は日本語のみ（要件: i18n の構造は初期から担保、辞書は ja で開始）。
 * 文言はキー管理し、将来 en 辞書を追加するだけで多言語化できるようにしておく。
 */
i18n.use(initReactI18next).init({
  resources: {
    ja,
  },
  lng: "ja",
  fallbackLng: "ja",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
