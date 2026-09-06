"use client"

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import fr from "./fr"
import en from "./en"
import ar from "./ar"
import { DEFAULT_LOCALE } from "./config"

export * from "./config"

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { fr: { translation: fr }, en: { translation: en }, ar: { translation: ar } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
  })
}

export default i18n
