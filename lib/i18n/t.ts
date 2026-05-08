// Server-only: uses next/headers `cookies()`, which throws in Client Components.
import { cookies } from 'next/headers'
import { zhTW, type Translations } from './locales/zh-TW'
import { en } from './locales/en'

export const SUPPORTED_LOCALES = ['zh-TW', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'
export const LOCALE_COOKIE = 'lang'

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'zh-TW' || value === 'en'
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}

const dictionaries: Record<Locale, Translations> = {
  'zh-TW': zhTW,
  en,
}

export async function getTranslations(): Promise<Translations> {
  const locale = await getLocale()
  return dictionaries[locale]
}
