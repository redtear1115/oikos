import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { Landing } from './_landing/Landing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.landing
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/', locale),
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

export default async function RootPage({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale]
  // Public landing — never redirect. Signed-in viewers get the CTA pointed at
  // /dashboard so they land back in the app in one tap; new viewers get
  // /sign-in. Either way the page renders.
  const user = await getCurrentUser()
  const ctaHref = user ? '/dashboard' : localizedHref('/sign-in', locale)

  // JSON-LD bundle for the public landing — SoftwareApplication (rich card for
  // the app itself, moved from /sign-in per #390 so the canonical lives on the
  // entry page) + FAQPage. Site-wide WebSite / Organization identity schemas
  // live in app/[locale]/layout.tsx (#669 M-11) so they render once across every
  // public page instead of being duplicated here. Built per-request so
  // alternateName / description / featureList follow the active locale (#467).

  // FAQPage JSON-LD (#344, #611) — emitted per-locale so each rendered URL's
  // rich-result language matches its visible content. Answers held to ~40–60 字
  // to fit AI Overview's Answer Capsule extraction window.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: t.landing.jsonLdFaq.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }

  const softwareAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${APP_URL}/#software`,
    name: t.landing.jsonLdAppName,
    alternateName: t.landing.jsonLdAlternateNames,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android (PWA)',
    description: t.landing.jsonLdAppDescription,
    url: APP_URL,
    inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
    // @id cross-refs (#702) tie this node to the WebSite / Organization schemas
    // emitted in app/[locale]/layout.tsx so crawlers see one connected graph.
    isPartOf: { '@id': `${APP_URL}/#website` },
    publisher: { '@id': `${APP_URL}/#organization` },
    author: { '@type': 'Person', name: 'Ray Lee' },
    datePublished: '2026-05-03',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
    featureList: t.landing.jsonLdFeatureList,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Landing
        t={t.landing}
        ctaHref={ctaHref}
        signInHref={localizedHref('/sign-in', locale)}
        migrateHrefs={{
          honeydue: localizedHref('/migrate/honeydue', locale),
          spendee: localizedHref('/migrate/spendee', locale),
          cwmoney: localizedHref('/migrate/cwmoney', locale),
        }}
        legalLinks={{
          termsHref: localizedHref('/terms', locale),
          termsLabel: t.signIn.termsLink,
          privacyHref: localizedHref('/privacy', locale),
          privacyLabel: t.signIn.privacyLink,
        }}
        languageSwitcher={<LanguageSwitcher current={locale} variant="footer" />}
      />
    </>
  )
}
