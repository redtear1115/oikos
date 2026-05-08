import type { ReactNode } from 'react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

/** Wrap components that require TranslationsProvider in tests. */
export function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <TranslationsProvider value={zhTW} locale="zh-TW">
      {children}
    </TranslationsProvider>
  )
}
