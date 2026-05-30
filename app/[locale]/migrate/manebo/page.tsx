import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'
import { MigrateDifferentiators } from '../_components/MigrateDifferentiators'
import { MigrateTrustBlock, MigrateFooter } from '../_components/MigrateTrustFooter'
import { MigrateBreadcrumbJsonLd } from '../_components/MigrateBreadcrumbJsonLd'
import { MigrateHowToJsonLd } from '../_components/MigrateHowToJsonLd'
import { MigrateFaq } from '../_components/MigrateFaq'
import { MigrateComparison } from '../_components/MigrateComparison'
import { MigrateOtherSources } from '../_components/MigrateOtherSources'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.migrate.manebo
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/migrate/manebo', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/migrate/manebo', locale),
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

export default async function MigrateManebo({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale].migrate
  const page = t.pages.manebo
  const signInHref = localizedHref('/sign-in', locale)

  return (
    <div className="space-y-10 md:space-y-14">
      <MigrateBreadcrumbJsonLd locale={locale} source="manebo" />
      <MigrateHowToJsonLd
        locale={locale}
        source="manebo"
        name={page.heroTitle}
        description={page.heroSubtitle}
        steps={[page.step1, page.step2, page.step3]}
      />
      <MigrateHero kicker={page.heroKicker} title={page.heroTitle} subtitle={page.heroSubtitle} />

      <MigrateDifferentiators heading={t.differentiatorsHeading} items={page.differentiators} />

      <MigrateSteps heading={page.stepsHeading} steps={[page.step1, page.step2, page.step3]} />

      <MigrateTool t={t} signInHref={signInHref} hint="manebo" />

      <MigrateComparison
        heading={t.comparisonHeading.replace('{other}', page.comparison.otherLabel)}
        futariLabel="Futari"
        otherLabel={page.comparison.otherLabel}
        rows={page.comparison.rows}
      />

      <MigrateFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <MigrateOtherSources locale={locale} currentSource="manebo" copy={t.otherSources} />

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
