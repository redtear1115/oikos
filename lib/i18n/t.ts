// Server-only: uses next/headers `cookies()`, which throws in Client Components.
import { cache } from 'react'
import { cookies } from 'next/headers'
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

export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
})

export const dictionaries: Record<Locale, Translations> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
}

export const getTranslations = cache(async (): Promise<Translations> => {
  const locale = await getLocale()
  return dictionaries[locale]
})
