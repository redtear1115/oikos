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
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0) return { locale: null, rest: '/' }
  const first = segs[0]
  if (isLocale(first)) {
    const remainder = segs.slice(1).join('/')
    return { locale: first, rest: remainder ? `/${remainder}` : '/' }
  }
  return { locale: null, rest: pathname }
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
    if (isPublicPage(pathname)) {
      const target = pathname === '/' ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`
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

export function buildLocaleUrl(currentPath: string, target: Locale): string {
  const { rest } = stripLocaleFromPath(currentPath)
  if (target === DEFAULT_LOCALE) return rest
  return rest === '/' ? `/${target}` : `/${target}${rest}`
}

export function getHreflangAlternates(
  publicPath: '/' | '/sign-in' | '/terms' | '/privacy',
  baseUrl: string,
) {
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
