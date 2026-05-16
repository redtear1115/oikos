// Server-only: uses next/headers `cookies()` + `headers()`, which throw in Client Components.
import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { zhTW, type Translations } from './locales/zh-TW'
import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'
import { ja } from './locales/ja'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from './locales-meta'

export {
  SUPPORTED_LOCALES,
  type Locale,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
} from './locales-meta'

// Resolution order: x-locale header (set by middleware for URL-prefix public pages)
// > lang cookie (used on dashboard pages and as the persistence layer for switcher
// clicks) > DEFAULT_LOCALE.
export const getLocale = cache(async (): Promise<Locale> => {
  const headerStore = await headers()
  const headerLocale = headerStore.get('x-locale')
  if (isLocale(headerLocale)) return headerLocale

  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE
})

const dictionaries: Record<Locale, Translations> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
}

export const getTranslations = cache(async (): Promise<Translations> => {
  const locale = await getLocale()
  return dictionaries[locale]
})
