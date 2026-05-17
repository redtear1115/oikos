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

// FAQPage JSON-LD (#344) — zh-TW only to match the dominant audience and avoid
// per-locale schema duplication. Answers held to ~40–60 字 to fit AI Overview's
// Answer Capsule extraction window.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  inLanguage: 'zh-TW',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Futari 是什麼？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Futari 是專為夫妻、伴侶設計的雙人共享記帳 PWA，支援自動分攤、AA 結算、家庭資產盤點與愛車油耗紀錄。',
      },
    },
    {
      '@type': 'Question',
      name: '如何開始使用？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '用 Google 帳號登入後建立兩人帳本，邀請伴侶加入即可一起記帳。可加到手機主畫面當 PWA 使用，完全免費。',
      },
    },
    {
      '@type': 'Question',
      name: '資料安全嗎？',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '所有資料儲存於 Supabase 加密資料庫，僅你和伴侶兩人能存取。我們不會分享或販售你的記帳內容。',
      },
    },
  ],
} as const

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

  // JSON-LD bundle for the public landing — WebSite (sitelinks search box hint),
  // Organization (brand identity), SoftwareApplication (rich card for the app
  // itself, moved from /sign-in per #390 so the canonical lives on the entry page).
  // Built per-request so alternateName / description / featureList follow the
  // active locale (#467).
  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: t.landing.jsonLdAppName,
    alternateName: t.landing.jsonLdAlternateNames,
    url: APP_URL,
    inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
  }

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Futari',
    url: APP_URL,
    logo: `${APP_URL}/icons/apple-touch-icon.png`,
  }

  const softwareAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: t.landing.jsonLdAppName,
    alternateName: t.landing.jsonLdAlternateNames,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Web, iOS, Android (PWA)',
    description: t.landing.jsonLdAppDescription,
    url: APP_URL,
    inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
    author: { '@type': 'Person', name: 'Ray Lee' },
    datePublished: '2026-05-03',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
    featureList: t.landing.jsonLdFeatureList,
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
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
        languageSwitcher={<LanguageSwitcher current={locale} variant="footer" />}
      />
    </>
  )
}
