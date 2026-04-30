// Multi-language framework for the construction app.
//
// ## Adding a new language (e.g. Vietnamese)
//   1. Create lib/locales/vi.ts that exports a default object satisfying
//        Record<TranslationKey, string>
//      (TypeScript will tell you exactly which keys are missing.)
//   2. Append { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' }
//      to LANGUAGES below and import it into LOCALES.
//   3. Done — the picker UI is data-driven from LANGUAGES, no other changes.
//
// Translations live in lib/locales/<code>.ts. en.ts is the source of truth
// and defines TranslationKey. Other locales are typed against it so missing
// keys produce a TypeScript error at build time.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import en, { type TranslationKey } from './locales/en'
import es from './locales/es'

// ── Registry ────────────────────────────────────────────────────────────────
// Order in this array controls the picker order.
export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

// LOCALES is keyed by code so translate() doesn't need a switch.
const LOCALES: Record<LanguageCode, Record<TranslationKey, string>> = {
  en,
  es,
}

const STORAGE_KEY = 'app_language'

function isSupported(code: string | null | undefined): code is LanguageCode {
  return !!code && LANGUAGES.some(l => l.code === code)
}

// Replace {placeholders} in the template with values from `vars`.
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key]
    return v == null ? '' : String(v)
  })
}

// Pure resolver — exported so non-React contexts (services, PDF generators)
// can also translate when given a language code.
export function translate(language: LanguageCode, key: TranslationKey, vars?: Record<string, string | number>): string {
  const fromLang = LOCALES[language]?.[key]
  const fromEn   = LOCALES.en[key]
  const raw      = fromLang ?? fromEn ?? key
  return interpolate(raw, vars)
}

// ── React context ───────────────────────────────────────────────────────────
type Ctx = {
  language: LanguageCode
  setLanguage: (code: LanguageCode) => Promise<void>
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  ready: boolean
}

const LanguageContext = createContext<Ctx>({
  language: 'en',
  setLanguage: async () => {},
  t: (key) => translate('en', key),
  ready: false,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<LanguageCode>('en')
  const [ready, setReady]   = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY)
        if (isSupported(saved)) setLang(saved)
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const setLanguage = useCallback(async (code: LanguageCode) => {
    setLang(code)
    try { await AsyncStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => translate(language, key, vars),
    [language],
  )

  const value = useMemo<Ctx>(() => ({ language, setLanguage, t, ready }), [language, setLanguage, t, ready])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}

// ── Backwards compatibility ────────────────────────────────────────────────
// The original lib/i18n.ts exported `t(language, key)` and `Language`. Keep
// those exports here so existing call sites keep compiling while we migrate
// screens to useLanguage(). New code should prefer useLanguage().t(key).

/** @deprecated use LanguageCode */
export type Language = LanguageCode

/** @deprecated use useLanguage().t(key) */
export function t(language: LanguageCode, key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(language, key, vars)
}

export type { TranslationKey }
