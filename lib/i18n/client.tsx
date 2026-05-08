'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Translations } from './locales/zh-TW'

const TranslationsContext = createContext<Translations | null>(null)

export function TranslationsProvider({
  value,
  children,
}: {
  value: Translations
  children: ReactNode
}) {
  return <TranslationsContext.Provider value={value}>{children}</TranslationsContext.Provider>
}

export function useTranslations(): Translations {
  const ctx = useContext(TranslationsContext)
  if (!ctx) {
    throw new Error('useTranslations must be used inside <TranslationsProvider>')
  }
  return ctx
}
