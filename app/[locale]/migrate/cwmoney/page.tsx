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
import { MigrateOtherSources } from '../_components/MigrateOtherSources'

type Params = Promise<{ locale: string }>

/** Static file served from `public/` — owned by #557 (real content lands there). */
const TEMPLATE_HREF = '/cwmoney-template.xlsx'

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.migrate.cwmoney
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/migrate/cwmoney', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/migrate/cwmoney', locale),
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

export default async function MigrateCwmoney({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale].migrate
  const page = t.pages.cwmoney
  const signInHref = localizedHref('/sign-in', locale)

  // #579: embed the template download inside step 2 — keeps the upload card
  // as the only button-styled CTA above the fold, makes the step list the
  // actual flow rather than a static recap.
  const step2WithDownload = (
    <>
      <div>{page.step2}</div>
      <a
        href={TEMPLATE_HREF}
        download
        className="inline-flex items-center gap-2 mt-2 text-[13.5px]"
        style={{
          color: 'var(--ink)',
          textDecoration: 'underline',
          textDecorationColor: 'var(--accent)',
          textUnderlineOffset: '4px',
        }}
      >
        <span aria-hidden>↓</span>
        <span>{page.templateDownloadLabel}</span>
      </a>
      <p className="text-[12px] mt-1.5 m-0" style={{ color: 'var(--ink-3)' }}>
        {page.templateNote}
      </p>
    </>
  )

  return (
    <div className="space-y-10 md:space-y-14">
      <MigrateBreadcrumbJsonLd locale={locale} source="cwmoney" />
      <MigrateHero kicker={page.heroKicker} title={page.heroTitle} subtitle={page.heroSubtitle} />

      <MigrateDifferentiators
        heading={t.differentiatorsHeading}
        items={page.differentiators}
      />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[page.step1, step2WithDownload, page.step3]}
      />

      <MigrateTool t={t} signInHref={signInHref} hint="cwmoney" />

      <MigrateComparison
        heading={t.comparisonHeading.replace('{other}', page.comparison.otherLabel)}
        futariLabel="Futari"
        otherLabel={page.comparison.otherLabel}
        rows={page.comparison.rows}
      />

      <MigrateFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <MigrateOtherSources locale={locale} currentSource="cwmoney" copy={t.otherSources} />

      <MigrateTrustBlock heading={t.trust.heading} items={t.trust.items} />

      <MigrateFooter trustNote={t.footerTrust} />
    </div>
  )
}
