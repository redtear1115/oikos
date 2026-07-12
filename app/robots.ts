import type { MetadataRoute } from 'next'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// Crawlable public pages. /sign-in intentionally excluded — see DISALLOWED below.
const PUBLIC_PATHS = ['/', '/terms', '/privacy', '/migrate']
// Public subtrees we want explicit allow signals for (so crawlers don't fall
// back to default heuristics on /migrate/* growth).
const PUBLIC_PREFIXES = ['/migrate']
// Localized but should NOT be indexed: auth funnel page.
const DISALLOWED_LOCALIZED = ['/sign-in']

export default function robots(): MetadataRoute.Robots {
  const allow = Array.from(
    new Set([
      ...PUBLIC_PATHS.flatMap((path) =>
        SUPPORTED_LOCALES.map((locale) => localizedHref(path, locale))
      ),
      ...PUBLIC_PREFIXES.flatMap((prefix) =>
        SUPPORTED_LOCALES.map((locale) => `${localizedHref(prefix, locale)}/`)
      ),
    ])
  )
  const disallow = Array.from(
    new Set([
      ...DISALLOWED_LOCALIZED.flatMap((path) =>
        SUPPORTED_LOCALES.map((locale) => localizedHref(path, locale))
      ),
      // Auth-walled and internal paths. Even though proxy 307s these to
      // /sign-in for unauthed crawlers, declaring them keeps signals clean.
      '/dashboard',
      '/setup',
      '/onboarding',
      '/invite/',
      '/auth/',
      '/api/',
      '/offline',
    ])
  )
  return {
    rules: [
      {
        userAgent: '*',
        allow,
        disallow,
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
