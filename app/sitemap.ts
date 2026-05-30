import type { MetadataRoute } from 'next'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// Per-locale URLs + hreflang alternates restored (#400) — URL-prefix locale
// routing makes each /<locale>/<path> a crawlable, distinct content variant.
// Previous cookie-based locale forced #392 short-term collapse to 4 URLs
// without hreflang; that's now superseded.
// /sign-in intentionally excluded — robots.ts disallows it (auth funnel,
// no SEO value). Keeping sitemap + robots consistent avoids mixed signals.
//
// `lastModified` is a per-path manual constant rather than `new Date()` — Google
// treats a moving lastmod as "everything just changed" and drops the crawl-
// prioritisation signal entirely. Bump the date by hand when the page's content
// actually changes; the comment next to each entry tracks the trigger. (#669)
const PATHS = [
  // Landing copy / hero / migrate cross-link section
  { path: '/', changeFrequency: 'weekly' as const, priority: 1.0, lastModified: '2026-05-20' },
  // /migrate/* copy + comparison + FAQ
  { path: '/migrate/honeydue', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/spendee', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/cwmoney', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-20' },
  { path: '/migrate/moneybook', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  { path: '/migrate/andromoney', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  { path: '/migrate/mobills', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  { path: '/migrate/manebo', changeFrequency: 'monthly' as const, priority: 0.8, lastModified: '2026-05-30' },
  // Legal pages
  { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.3, lastModified: '2026-05-03' },
  { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.3, lastModified: '2026-05-03' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const { path, changeFrequency, priority, lastModified } of PATHS) {
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
