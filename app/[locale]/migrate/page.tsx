import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'
import { MigrateHero } from './_components/MigrateSteps'
import { MigrateSourceCard } from './_components/MigrateSourceCard'
import { MigrateTrustBlock, MigrateFooter } from './_components/MigrateTrustFooter'

type Params = Promise<{ locale: string }>

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'
const ALL_SOURCES = Object.keys(MIGRATE_SOURCES) as MigrateSlug[]
const PATH = '/migrate'

// One static HTML per locale; the source set is derived from MIGRATE_SOURCES,
// so pruning/adding a competitor updates the hub automatically.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) return {}
  const locale: Locale = rawLocale
  const t = dictionaries[locale].seo.migrateHub
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates(PATH, locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref(PATH, locale),
      siteName: 'Futari · 雙人記帳',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
      images: [ogImage(locale)],
    },
  }
}

export default async function MigrateHubPage({ params }: { params: Params }) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale as Locale
  const t = dictionaries[locale].migrate
  const hub = t.hub
  const sources = t.otherSources

  // CollectionPage wrapping an ItemList of every migration guide — gives the
  // hub a structured-data identity distinct from each per-source page.
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: hub.heroTitle,
    description: hub.heroSubtitle,
    url: `${APP_URL}${localizedHref(PATH, locale)}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: ALL_SOURCES.map((source, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${APP_URL}${localizedHref(`/migrate/${source}`, locale)}`,
        name: sources.items[source].name,
        description: sources.items[source].description,
      })),
    },
  }

  return (
    <div className="space-y-10 md:space-y-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <MigrateHero kicker={hub.heroKicker} title={hub.heroTitle} subtitle={hub.heroSubtitle} />

      <section className="space-y-5">
        <h2
          className="m-0 text-[20px] md:text-[22px] font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
        >
          {hub.heading}
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 m-0 p-0 list-none">
          {ALL_SOURCES.map((source) => {
            const item = sources.items[source]
            return (
              <MigrateSourceCard
                key={source}
                locale={locale}
                slug={source}
                name={item.name}
                description={item.description}
                cta={sources.cta}
              />
            )
          })}
        </ul>
      </section>

      <MigrateTrustBlock heading={t.trust.heading} items={t.trust.items} />

      <MigrateFooter
        trustNote={t.footerTrust}
        legalLinks={{
          termsHref: localizedHref('/terms', locale),
          termsLabel: dictionaries[locale].signIn.termsLink,
          privacyHref: localizedHref('/privacy', locale),
          privacyLabel: dictionaries[locale].signIn.privacyLink,
        }}
      />
    </div>
  )
}
