import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'

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

  return (
    <div className="space-y-10">
      <MigrateHero title={page.heroTitle} subtitle={page.heroSubtitle} />

      <div className="space-y-3 text-center">
        <a
          href={TEMPLATE_HREF}
          download
          className="inline-flex items-center justify-center h-11 px-5 rounded-xl text-[14px] font-medium cursor-pointer"
          style={{
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--hairline)',
            letterSpacing: '0.6px',
            textDecoration: 'none',
          }}
        >
          {page.templateDownloadLabel}
        </a>
        <p className="text-[13px] m-0" style={{ color: 'var(--ink-3)' }}>
          {page.templateNote}
        </p>
      </div>

      <MigrateTool t={t} signInHref={signInHref} hint="cwmoney" />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[page.step1, page.step2, page.step3]}
      />
    </div>
  )
}
