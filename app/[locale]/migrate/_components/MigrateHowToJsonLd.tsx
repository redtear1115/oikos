import type { Locale } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Source = 'honeydue' | 'spendee' | 'cwmoney'

const SCHEMA_LANG: Record<Locale, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en',
  ja: 'ja',
}

/**
 * HowTo + HowToStep JSON-LD for the /migrate/<source> walkthrough (#669 M-3).
 * Matches the three steps rendered by MigrateSteps so the schema mirrors the
 * visible flow. Emitted per-locale (alongside FaqPage, BreadcrumbList, and
 * ItemList) so each URL's rich-result language matches the rendered content.
 *
 * Google's visual HowTo rich result was deprecated in 2023 but the schema is
 * still consumed by AI Overview / Gemini / Bing for topic + step extraction.
 */
export function MigrateHowToJsonLd({
  locale,
  source,
  name,
  description,
  steps,
}: {
  locale: Locale
  source: Source
  /** Page-level HowTo title — typically the migrate page's heroTitle. */
  name: string
  /** Page-level HowTo description — typically the migrate page's heroSubtitle. */
  description: string
  /** Plain-text steps in order. Length must be 3 (matches MigrateSteps). */
  steps: readonly [string, string, string]
}) {
  const pageUrl = `${APP_URL}${localizedHref(`/migrate/${source}`, locale)}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    inLanguage: SCHEMA_LANG[locale],
    name,
    description,
    step: steps.map((text, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: `Step ${i + 1}`,
      text,
      url: `${pageUrl}#step-${i + 1}`,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
