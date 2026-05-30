import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { USE_CASES, USE_CASE_SLUGS, type UseCaseSlug } from '@/lib/use-case/cases'
import { UseCaseHero } from '../_components/UseCaseHero'
import { UseCasePainPoints } from '../_components/UseCasePainPoints'
import { UseCaseFeatures } from '../_components/UseCaseFeatures'
import { UseCaseFaq } from '../_components/UseCaseFaq'
import { UseCaseCta } from '../_components/UseCaseCta'
import { UseCaseOtherCases } from '../_components/UseCaseOtherCases'

type Params = Promise<{ locale: string; slug: string }>

export function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap((locale) =>
    USE_CASE_SLUGS.map((slug) => ({ locale, slug })),
  )
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale) || !USE_CASE_SLUGS.includes(slug as UseCaseSlug)) return {}
  const locale: Locale = rawLocale
  const t = dictionaries[locale].seo.useCase[slug as UseCaseSlug]
  const path = `/use-case/${slug}`
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

export default async function UseCasePage({ params }: { params: Params }) {
  const { locale: rawLocale, slug } = await params
  if (!isLocale(rawLocale) || !USE_CASE_SLUGS.includes(slug as UseCaseSlug)) notFound()
  const locale = rawLocale as Locale
  const useCaseSlug = slug as UseCaseSlug

  const def = USE_CASES[useCaseSlug]
  const t = dictionaries[locale].useCase
  const page = t.pages[useCaseSlug]
  const signInHref = localizedHref('/sign-in', locale)

  return (
    <div className="space-y-10 md:space-y-14">
      <UseCaseHero
        kicker={page.heroKicker}
        title={page.heroTitle}
        subtitle={page.heroSubtitle}
      />

      <UseCasePainPoints items={page.painPoints} />

      <UseCaseFeatures
        heading={t.featuresHeading}
        featureKeys={def.features}
        features={t.features}
      />

      <UseCaseCta label={t.ctaLabel} signInHref={signInHref} />

      <UseCaseFaq locale={locale} heading={t.faqHeading} items={page.faq} />

      <UseCaseOtherCases locale={locale} currentSlug={useCaseSlug} copy={t.otherCases} />
    </div>
  )
}
