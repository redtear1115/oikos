import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MIGRATE_SOURCES, type MigrateSlug, type SourceDef } from '@/lib/migrate/sources'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'
import { MigrateIntroCallout } from '../_components/MigrateIntroCallout'
import { MigrateDifferentiators } from '../_components/MigrateDifferentiators'
import { MigrateChatgptWorkflow } from '../_components/MigrateChatgptWorkflow'
import { MigrateTrustBlock, MigrateFooter } from '../_components/MigrateTrustFooter'
import { MigrateBreadcrumbJsonLd } from '../_components/MigrateBreadcrumbJsonLd'
import { MigrateHowToJsonLd } from '../_components/MigrateHowToJsonLd'
import { MigrateFaq } from '../_components/MigrateFaq'
import { MigrateComparison } from '../_components/MigrateComparison'
import { MigrateOtherSources } from '../_components/MigrateOtherSources'

type Params = Promise<{ locale: string; source: string }>

// Build-time expansion: all locale × source combinations → pure static HTML.
// SEO is identical to individual page files.
export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    Object.keys(MIGRATE_SOURCES).map((source) => ({ locale, source })),
  )
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale, source } = await params
  if (!isLocale(rawLocale) || !(source in MIGRATE_SOURCES)) return {}
  const locale: Locale = rawLocale
  const slug = source as MigrateSlug
  const t = dictionaries[locale].seo.migrate[slug]
  const path = `/migrate/${slug}`
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates(path, locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref(path, locale),
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

export default async function MigrateSourcePage({ params }: { params: Params }) {
  const { locale: rawLocale, source } = await params
  if (!isLocale(rawLocale) || !(source in MIGRATE_SOURCES)) notFound()
  const locale = rawLocale as Locale
  const slug = source as MigrateSlug

  const def = MIGRATE_SOURCES[slug] as SourceDef
  const t = dictionaries[locale].migrate
  const page = t.pages[slug]
  const signInHref = localizedHref('/sign-in', locale)

  // spendee: CSV format hint injected inside step 1
  const step1Content =
    page.formatHintLabel ? (
      <>
        <div>{page.step1}</div>
        <div className="mt-3 space-y-1.5">
          <div className="text-xs" style={{ color: 'var(--ink-2)' }}>
            {page.formatHintLabel}
          </div>
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
          <p className="text-xs mt-1.5 m-0" style={{ color: 'var(--ink-3)' }}>
            {page.formatHintNote}
          </p>
        </div>
      </>
    ) : (
      page.step1
    )

  // cwmoney: Excel template download injected inside step 2
  const step2Content =
    def.templateDownload ? (
      <>
        <div>{page.step2}</div>
        <a
          href={def.templateDownload.href}
          download
          className="inline-flex items-center gap-2 mt-2 text-sm"
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
        <p className="text-xs mt-1.5 m-0" style={{ color: 'var(--ink-3)' }}>
          {page.templateNote}
        </p>
      </>
    ) : (
      page.step2
    )

  return (
    <div className="space-y-10 md:space-y-14">
      <MigrateBreadcrumbJsonLd locale={locale} source={slug} />
      <MigrateHowToJsonLd
        locale={locale}
        source={slug}
        name={page.heroTitle}
        description={page.heroSubtitle}
        steps={[page.step1, page.step2, page.step3]}
      />
      <MigrateHero kicker={page.heroKicker} title={page.heroTitle} subtitle={page.heroSubtitle} />

      {page.intro && <MigrateIntroCallout text={page.intro} />}

      <MigrateDifferentiators heading={t.differentiatorsHeading} items={page.differentiators} />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[step1Content, step2Content, page.step3]}
      />

      {def.screenshotWorkflow && (
        <MigrateChatgptWorkflow copy={t.chatgptWorkflow} source={slug} />
      )}

      <MigrateTool t={t} signInHref={signInHref} hint={slug} />

      <MigrateComparison
        heading={t.comparisonHeading.replace('{other}', def.name)}
        futariLabel="Futari"
        otherLabel={def.name}
        rows={def.comparison.rows}
      />

      <MigrateFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <MigrateOtherSources locale={locale} currentSource={slug} copy={t.otherSources} />

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
