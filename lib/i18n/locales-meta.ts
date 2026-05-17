// Edge-safe: no next/headers import. Used by both proxy.ts and lib/i18n/t.ts.
export const SUPPORTED_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'zh-TW'
export const LOCALE_COOKIE = 'lang'

export function isLocale(value: string | undefined | null): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
}
