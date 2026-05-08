'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Translations } from './locales/zh-TW'
import { DEFAULT_LOCALE } from './locales-meta'

const TranslationsContext = createContext<Translations | null>(null)
const LocaleContext = createContext<string>(DEFAULT_LOCALE)

export function TranslationsProvider({
  value,
  locale,
  children,
}: {
  value: Translations
  locale: string
  children: ReactNode
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>
    </LocaleContext.Provider>
  )
}

export function useTranslations(): Translations {
  const ctx = useContext(TranslationsContext)
  if (!ctx) {
    throw new Error('useTranslations must be used inside <TranslationsProvider>')
  }
  return ctx
}

export function useLocale(): string {
  return useContext(LocaleContext)
}
