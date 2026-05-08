// Server-only: uses next/headers `cookies()`, which throws in Client Components.
import { cookies } from 'next/headers'
import { zhTW, type Translations } from './locales/zh-TW'
import { zhCN } from './locales/zh-CN'
import { en } from './locales/en'
import { ja } from './locales/ja'

export const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'
export const LOCALE_COOKIE = 'lang'

export function isLocale(value: string | undefined | null): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
}

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
