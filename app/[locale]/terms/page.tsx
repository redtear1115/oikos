import type { Metadata } from 'next'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.terms
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/terms', locale),
    openGraph: {
      title: t.title,
      description: t.description,
      url: localizedHref('/terms', locale),
      siteName: 'Futari',
      type: 'article',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: t.title }],
    },
  }
}

export default async function TermsPage({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale]

  return (
    <main
      className="min-h-screen px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md mx-auto">
        <h1
          className="text-page leading-tight mb-2"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          {t.termsPage.heading}
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--ink-3)' }}>
          {t.termsPage.lastUpdated}
        </p>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <p>{t.termsPage.intro}</p>
          <ul className="list-disc pl-5 space-y-2">
            {t.termsPage.bullets.map((bullet, i) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>
          <p>{t.termsPage.outro}</p>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href={localizedHref('/', locale)} className="underline" style={{ color: 'var(--ink-2)' }}>
            {t.termsPage.backHome}
          </Link>
          <Link href={localizedHref('/privacy', locale)} className="underline" style={{ color: 'var(--ink-2)' }}>
            {t.termsPage.privacyLink}
          </Link>
        </div>
      </div>
    </main>
  )
}
