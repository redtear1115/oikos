import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/supabase/server'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { Landing } from './_landing/Landing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

const LANDING_TITLE = 'Futari · 兩個人，一本帳｜伴侶共享記帳 PWA'
const LANDING_DESCRIPTION =
  '專為夫妻、伴侶設計的雙人共享帳本。自動分攤、AA 結算、家庭資產盤點、保險與愛車油耗紀錄，台灣團隊製作的 Mobile-first PWA 家計簿。'
const LANDING_OG_DESCRIPTION = '兩個人，一本帳。一起記錄、自動分攤、輕鬆結算。'

// Each public page declares its own canonical (root layout no longer sets one)
// so sitemap × canonical signals agree per #305. hreflang ?lang=xx variants were
// dropped (#392) — cookie-based locale doesn't map to canonical URL variants.
export const metadata: Metadata = {
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: LANDING_TITLE,
    description: LANDING_OG_DESCRIPTION,
    url: '/',
    siteName: 'Futari',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: LANDING_TITLE,
    description: LANDING_OG_DESCRIPTION,
  },
}

// JSON-LD bundle for the public landing — WebSite (sitelinks search box hint),
// Organization (brand identity), SoftwareApplication (rich card for the app
// itself, moved from /sign-in per #390 so the canonical lives on the entry page).
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
  author: { '@type': 'Person', name: 'Ray Lee' },
  datePublished: '2026-05-03',
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

export default async function RootPage() {
  // Public landing — never redirect. Signed-in viewers get the CTA pointed at
  // /dashboard so they land back in the app in one tap; new viewers get
  // /sign-in. Either way the page renders.
  const [user, t, locale] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
    getLocale(),
  ])

  const ctaHref = user ? '/dashboard' : '/sign-in'

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
        languageSwitcher={<LanguageSwitcher current={locale} variant="footer" />}
      />
    </>
  )
}
