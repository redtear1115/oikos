import type { MetadataRoute } from 'next'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// Per-locale URLs + hreflang alternates restored (#400) — URL-prefix locale
// routing makes each /<locale>/<path> a crawlable, distinct content variant.
// Previous cookie-based locale forced #392 short-term collapse to 4 URLs
// without hreflang; that's now superseded.
const PATHS = [
  { path: '/', changeFrequency: 'weekly' as const, priority: 1.0 },
  { path: '/sign-in', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  const entries: MetadataRoute.Sitemap = []

  for (const { path, changeFrequency, priority } of PATHS) {
    const languages: Record<string, string> = {}
    for (const locale of SUPPORTED_LOCALES) {
      languages[locale] = `${APP_URL}${localizedHref(path, locale)}`
    }
    languages['x-default'] = `${APP_URL}${localizedHref(path, DEFAULT_LOCALE)}`

    for (const locale of SUPPORTED_LOCALES) {
      entries.push({
        url: `${APP_URL}${localizedHref(path, locale)}`,
        lastModified,
        changeFrequency,
        priority,
        alternates: { languages },
      })
    }
  }

  return entries
}
