// Edge-safe: 不 import next/headers。middleware + server components 都會用。
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from './locales-meta'

/** Phase 1 範圍內、有 [locale] segment 對應的 public path。 */
export const PUBLIC_LOCALIZED_PATHS = ['/', '/sign-in', '/terms', '/privacy'] as const

/** URL 第一段若是 supported locale 則回傳之，否則 null。 */
export function parseLocaleFromPath(pathname: string): Locale | null {
  const segments = pathname.split('/').filter(Boolean)
  const first = segments[0]
  return isLocale(first) ? first : null
}

/** 把 /en/sign-in → /sign-in；/ja → /；不含 locale 則原樣回傳。 */
export function stripLocaleFromPath(pathname: string): string {
  const locale = parseLocaleFromPath(pathname)
  if (!locale) return pathname
  const stripped = pathname.slice(`/${locale}`.length)
  return stripped === '' ? '/' : stripped
}

/**
 * 給 default locale 不加 prefix；其他 locale 加 `/<locale>`。
 * `/` + 非 default → `/<locale>`；其它 path → `/<locale><path>`。
 */
export function localizedHref(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path
  if (path === '/') return `/${locale}`
  return `/${locale}${path}`
}

/**
 * 是否為 phase 1 「可帶 locale prefix 的 public page」。
 * 用於 middleware 判斷是否要做 rewrite + cookie sync。
 */
export function isPublicLocalizedPath(pathname: string): boolean {
  const stripped = stripLocaleFromPath(pathname)
  return (PUBLIC_LOCALIZED_PATHS as readonly string[]).includes(stripped)
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isLocale }
export type { Locale }
