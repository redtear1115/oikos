import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'
import { MigrateDifferentiators } from '../_components/MigrateDifferentiators'
import { MigrateTrustBlock, MigrateFooter } from '../_components/MigrateTrustFooter'
import { MigrateBreadcrumbJsonLd } from '../_components/MigrateBreadcrumbJsonLd'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.migrate.spendee
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/migrate/spendee', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/migrate/spendee', locale),
      siteName: 'Futari',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
      images: ['/og-image.png'],
    },
  }
}

export default async function MigrateSpendee({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale].migrate
  const page = t.pages.spendee
  const signInHref = localizedHref('/sign-in', locale)

  return (
    <div className="space-y-10 md:space-y-14">
      <MigrateBreadcrumbJsonLd locale={locale} source="spendee" />
      <MigrateHero kicker={page.heroKicker} title={page.heroTitle} subtitle={page.heroSubtitle} />

      <MigrateDifferentiators
        heading={t.differentiatorsHeading}
        items={page.differentiators}
      />

      <MigrateTool t={t} signInHref={signInHref} hint="spendee" />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[page.step1, page.step2, page.step3]}
      />

      <MigrateTrustBlock heading={t.trust.heading} items={t.trust.items} />

      <MigrateFooter trustNote={t.footerTrust} />
    </div>
  )
}
