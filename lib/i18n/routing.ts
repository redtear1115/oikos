import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from './locales-meta'

const PUBLIC_PAGES = ['/', '/sign-in', '/terms', '/privacy'] as const
type PublicPage = (typeof PUBLIC_PAGES)[number]

function isPublicPage(path: string): path is PublicPage {
  return (PUBLIC_PAGES as readonly string[]).includes(path)
}

export function stripLocaleFromPath(pathname: string): {
  locale: Locale | null
  rest: string
} {
  // Normalize trailing slash so '/sign-in/' is treated as '/sign-in'.
  // Middleware normally normalizes upstream, but a defensive strip here
  // keeps callers (sitemap, switcher) honest if they ever pass non-normalized input.
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/'
  const segs = normalized.split('/').filter(Boolean)
  if (segs.length === 0) return { locale: null, rest: '/' }
  const first = segs[0]
  if (isLocale(first)) {
    const remainder = segs.slice(1).join('/')
    return { locale: first, rest: remainder ? `/${remainder}` : '/' }
  }
  return { locale: null, rest: normalized }
}

export type LocaleRoutingDecision =
  | { action: 'rewrite'; targetPath: string; locale: Locale }
  | { action: 'redirect'; targetPath: string; status: 308 }
  | { action: 'set-locale'; locale: Locale }
  | { action: 'passthrough' }

export function decideLocaleRouting(pathname: string): LocaleRoutingDecision {
  const { locale, rest } = stripLocaleFromPath(pathname)

  // No locale prefix
  if (locale === null) {
    if (isPublicPage(rest)) {
      const target = rest === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${rest}`
      return { action: 'rewrite', targetPath: target, locale: DEFAULT_LOCALE }
    }
    return { action: 'passthrough' }
  }

  // Locale prefix present + stripped path is a public page
  if (isPublicPage(rest)) {
    if (locale === DEFAULT_LOCALE) {
      return { action: 'redirect', targetPath: rest, status: 308 }
    }
    return { action: 'set-locale', locale }
  }

  // Locale prefix but stripped path is NOT a public page — let it through
  // (e.g. /en/some-bogus-path → [locale]/layout.tsx notFound() handles it).
  return { action: 'passthrough' }
}

// Public-page detection for client-side helpers (LanguageSwitcher). Returns
// true for both unprefixed (/sign-in) and locale-prefixed (/en/sign-in)
// public URLs, including the bare locale root (/en, /ja). Uses
// stripLocaleFromPath + PUBLIC_PAGES so SUPPORTED_LOCALES is the single
// source of truth for what counts as a locale segment.
export function isPublicPath(pathname: string): boolean {
  const { rest } = stripLocaleFromPath(pathname)
  return isPublicPage(rest)
}

export function buildLocaleUrl(currentPath: string, target: Locale): string {
  const { rest } = stripLocaleFromPath(currentPath)
  if (target === DEFAULT_LOCALE) return rest
  return rest === '/' ? `/${target}` : `/${target}${rest}`
}

export function getHreflangAlternates(publicPath: PublicPage, baseUrl: string) {
  const url = (locale: Locale | 'default'): string => {
    if (locale === 'default' || locale === DEFAULT_LOCALE) {
      return `${baseUrl}${publicPath}`
    }
    return publicPath === '/'
      ? `${baseUrl}/${locale}`
      : `${baseUrl}/${locale}${publicPath}`
  }
  const languages: Record<string, string> = {}
  for (const loc of SUPPORTED_LOCALES) {
    languages[loc] = url(loc)
  }
  languages['x-default'] = url('default')
  return {
    canonical: url('default'),
    languages,
  }
}
