// Server-only: uses next/headers `cookies()`, which throws in Client Components.
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

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

const dictionaries: Record<Locale, Translations> = {
  'zh-TW': zhTW,
  'zh-CN': zhCN,
  en,
  ja,
}

export async function getTranslations(): Promise<Translations> {
  const locale = await getLocale()
  return dictionaries[locale]
}
