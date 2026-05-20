import type { Metadata } from 'next'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.privacy
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/privacy', locale),
    openGraph: {
      title: t.title,
      description: t.description,
      url: localizedHref('/privacy', locale),
      siteName: 'Futari',
      type: 'article',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: t.title }],
    },
  }
}

export default async function PrivacyPage({ params }: { params: Params }) {
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
          {t.privacyPage.heading}
        </h1>
        <p className="text-xs mb-8" style={{ color: 'var(--ink-3)' }}>
          {t.privacyPage.lastUpdated}
        </p>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          <p>{t.privacyPage.intro}</p>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            {t.privacyPage.sectionCollectTitle}
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            {t.privacyPage.sectionCollectItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            {t.privacyPage.sectionPurposeTitle}
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            {t.privacyPage.sectionPurposeItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            {t.privacyPage.sectionStorageTitle}
          </h2>
          <p>{t.privacyPage.sectionStorageBody}</p>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            {t.privacyPage.sectionThirdPartyTitle}
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            {t.privacyPage.sectionThirdPartyItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>

          <h2 className="text-base font-semibold pt-2" style={{ color: 'var(--ink)' }}>
            {t.privacyPage.sectionRightsTitle}
          </h2>
          <p>{t.privacyPage.sectionRightsBody}</p>

          <p className="pt-2">{t.privacyPage.outro}</p>
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href={localizedHref('/', locale)} className="underline" style={{ color: 'var(--ink-2)' }}>
            {t.privacyPage.backHome}
          </Link>
          <Link href={localizedHref('/terms', locale)} className="underline" style={{ color: 'var(--ink-2)' }}>
            {t.privacyPage.termsLink}
          </Link>
        </div>
      </div>
    </main>
  )
}
