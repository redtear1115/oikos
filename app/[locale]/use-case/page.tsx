import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASE_SLUGS } from '@/lib/use-case/cases'
import { UseCaseHero } from './_components/UseCaseHero'
import { UseCaseCard } from './_components/UseCaseCard'
import { UseCaseCta } from './_components/UseCaseCta'

type Params = Promise<{ locale: string }>

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'
const PATH = '/use-case'

// One static HTML per locale; the situation set is derived from USE_CASES, so
// adding or retiring a case updates the hub automatically.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) return {}
  const locale: Locale = rawLocale
  const t = dictionaries[locale].seo.useCaseHub
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

export default async function UseCaseHubPage({ params }: { params: Params }) {
  const { locale: rawLocale } = await params
  if (!isLocale(rawLocale)) notFound()
  const locale = rawLocale as Locale
  const t = dictionaries[locale].useCase
  const hub = t.hub

  // CollectionPage wrapping an ItemList of every situation page — gives the hub
  // a structured-data identity distinct from each per-situation page, and is
  // the middle node the per-page BreadcrumbList points at (#1058).
  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: hub.heroTitle,
    description: hub.heroSubtitle,
    url: `${APP_URL}${localizedHref(PATH, locale)}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: USE_CASE_SLUGS.map((slug, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${APP_URL}${localizedHref(`/use-case/${slug}`, locale)}`,
        name: hub.items[slug].name,
        description: hub.items[slug].description,
      })),
    },
  }

  return (
    <div className="space-y-10 md:space-y-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
      />
      <UseCaseHero
        kicker={hub.heroKicker}
        title={hub.heroTitle}
        subtitle={hub.heroSubtitle}
      />

      <section className="space-y-5">
        <h2
          className="m-0 text-[20px] md:text-[22px] font-medium"
          style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
        >
          {hub.heading}
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 m-0 p-0 list-none">
          {USE_CASE_SLUGS.map((slug) => (
            <UseCaseCard
              key={slug}
              locale={locale}
              slug={slug}
              name={hub.items[slug].name}
              description={hub.items[slug].description}
              cta={hub.cardCta}
            />
          ))}
        </ul>
      </section>

      <UseCaseCta label={t.ctaLabel} signInHref={localizedHref('/sign-in', locale)} slug="hub" />
    </div>
  )
}
