import type { Locale } from '@/lib/i18n/locales-meta'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'
import { MigrateSourceCard } from './MigrateSourceCard'
import { Phrase } from '../../_components/Phrase'
import { s } from '../../_components/brand-inner'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Source = MigrateSlug

const ALL_SOURCES = Object.keys(MIGRATE_SOURCES) as MigrateSlug[]

type OtherSources = Translations['migrate']['otherSources']

/**
 * Cross-link section for the per-source /migrate landing pages (#612).
 * On each page, surfaces the *other two* sources as rows so visitors who
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
    <section className={s.band}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
      />
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={copy.heading} />
      </h2>
      <ul className={s.rows}>
        {others.map((source) => {
          const item = copy.items[source]
          return (
            <MigrateSourceCard
              key={source}
              locale={locale}
              slug={source}
              name={item.name}
              description={item.description}
              cta={copy.cta}
            />
          )
        })}
      </ul>
    </section>
  )
}
