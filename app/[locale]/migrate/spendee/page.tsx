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
import { MigrateFaq } from '../_components/MigrateFaq'
import { MigrateComparison } from '../_components/MigrateComparison'

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

  // Embed the format preview inside step 1 — mirrors the cwmoney/step-2
  // template-download pattern (#579) so the step list is the actual flow
  // rather than a static recap. Spendee users see the column layout before
  // they go pull the export, which heads off the most common "this didn't
  // work" support ticket (Transfer rows misclassified as income).
  const step1WithFormatHint = (
    <>
      <div>{page.step1}</div>
      <div
        className="mt-2.5 text-[12.5px]"
        style={{ color: 'var(--ink-3)' }}
      >
        <div className="mb-1">{page.formatHintLabel}</div>
        <code
          className="block px-3 py-2 rounded-[8px] text-[11.5px] leading-[1.6] break-all"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink-2)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {page.formatHintHeaders}
        </code>
        <p className="text-[12px] mt-1.5 m-0">{page.formatHintNote}</p>
      </div>
    </>
  )

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
        steps={[step1WithFormatHint, page.step2, page.step3]}
      />

      <MigrateComparison
        heading={t.comparisonHeading.replace('{other}', page.comparison.otherLabel)}
        futariLabel="Futari"
        otherLabel={page.comparison.otherLabel}
        rows={page.comparison.rows}
      />

      <MigrateFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <MigrateTrustBlock heading={t.trust.heading} items={t.trust.items} />

      <MigrateFooter trustNote={t.footerTrust} />
    </div>
  )
}
