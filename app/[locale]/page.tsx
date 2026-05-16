import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { Landing } from '../_landing/Landing'
import { getHreflangAlternates, buildLocaleUrl } from '@/lib/i18n/routing'
import { isLocale } from '@/lib/i18n/locales-meta'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

const LANDING_TITLE = 'Futari · 兩個人，一本帳｜伴侶共享記帳 PWA'
const LANDING_DESCRIPTION =
  '專為夫妻、伴侶設計的雙人共享帳本。自動分攤、AA 結算、家庭資產盤點、保險與愛車油耗紀錄，台灣團隊製作的 Mobile-first PWA 家計簿。'
const LANDING_OG_DESCRIPTION = '兩個人，一本帳。一起記錄、自動分攤、輕鬆結算。'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const alternates = getHreflangAlternates('/', APP_URL)
  const url = buildLocaleUrl('/', locale)
  return {
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    alternates,
    openGraph: {
      title: LANDING_TITLE,
      description: LANDING_OG_DESCRIPTION,
      url,
      siteName: 'Futari',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: LANDING_TITLE,
      description: LANDING_OG_DESCRIPTION,
    },
  }
}

const webSiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'Futari · ふたり',
  alternateName: ['Futari 家計簿', '兩個人的家計簿'],
  url: APP_URL,
  inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
} as const

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Futari',
  url: APP_URL,
  logo: `${APP_URL}/icons/apple-touch-icon.png`,
} as const

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Futari · ふたり',
  alternateName: ['Futari 家計簿', '兩個人的家計簿', 'ふたり 家計簿'],
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, iOS, Android (PWA)',
  description:
    '專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。',
  url: APP_URL,
  inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
  featureList: [
    '雙人共享記帳',
    '費用自動分攤與 AA 結算',
    '家庭資產盤點',
    '保險管理（保護型／儲蓄型）',
    '汽車與油耗紀錄',
    '定期收入',
    '離線瀏覽 PWA',
  ],
} as const

export default async function LocaleLandingPage() {
  const [user, t, locale] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
    getLocale(),
  ])

  const ctaHref = user ? '/dashboard' : buildLocaleUrl('/sign-in', locale)

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
      <Landing
        t={t.landing}
        ctaHref={ctaHref}
        languageSwitcher={<LanguageSwitcher current={locale} variant="footer" />}
      />
    </>
  )
}
