import Link from 'next/link'
import type { Locale } from '@/lib/i18n/locales-meta'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Source = MigrateSlug

const ALL_SOURCES = Object.keys(MIGRATE_SOURCES) as MigrateSlug[]

type OtherSources = Translations['migrate']['otherSources']

/**
 * Cross-link section for the per-source /migrate landing pages (#612).
 * On each page, surfaces the *other two* sources as cards so visitors who
 * arrived via the "wrong" source query can pivot in-place. Also emits an
 * ItemList JSON-LD describing the three guides as a single migration set.
 */
export function MigrateOtherSources({
  locale,
  currentSource,
  copy,
}: {
  locale: Locale
  currentSource: Source
  copy: OtherSources
}) {
  const others = ALL_SOURCES.filter((s) => s !== currentSource)

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: copy.heading,
    itemListElement: ALL_SOURCES.map((source, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${APP_URL}${localizedHref(`/migrate/${source}`, locale)}`,
      name: copy.items[source].name,
      description: copy.items[source].description,
    })),
  }

  return (
    <section className="space-y-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <h2
        className="m-0 text-[20px] md:text-[22px] font-medium"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {copy.heading}
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 m-0 p-0 list-none">
        {others.map((source) => {
          const item = copy.items[source]
          return (
            <li key={source}>
              <Link
                href={localizedHref(`/migrate/${source}`, locale)}
                className="block p-5 md:p-6 rounded-tile h-full"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <p
                  className="m-0 text-body md:text-button font-medium"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
                >
                  {item.name}
                </p>
                <p
                  className="m-0 mt-1.5 text-label md:text-meta leading-[1.65]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {item.description}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 mt-3 text-[13px]"
                  style={{
                    color: 'var(--ink)',
                    textDecoration: 'underline',
                    textDecorationColor: 'var(--accent)',
                    textUnderlineOffset: '4px',
                  }}
                >
                  {copy.cta}
                  <span aria-hidden>→</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
