import type { Metadata } from 'next'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { MigrateTool } from '../_components/MigrateTool'
import { MigrateHero, MigrateSteps } from '../_components/MigrateSteps'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.migrate.honeydue
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/migrate/honeydue', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/migrate/honeydue', locale),
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

export default async function MigrateHoneydue({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale].migrate
  const page = t.pages.honeydue
  const signInHref = localizedHref('/sign-in', locale)

  return (
    <div className="space-y-10">
      <MigrateHero title={page.heroTitle} subtitle={page.heroSubtitle} />

      <p className="text-[14px] leading-[1.85] m-0" style={{ color: 'var(--ink-2)' }}>
        {page.intro}
      </p>

      <MigrateTool t={t} signInHref={signInHref} hint="honeydue" />

      <MigrateSteps
        heading={page.stepsHeading}
        steps={[page.step1, page.step2, page.step3]}
      />
    </div>
  )
}
