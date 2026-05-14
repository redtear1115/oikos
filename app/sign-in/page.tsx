import type { Metadata } from 'next'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { SignInButton } from './SignInButton'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

export const metadata: Metadata = {
  alternates: {
    canonical: '/sign-in',
    languages: {
      'zh-TW': '/sign-in',
      'zh-CN': '/sign-in?lang=zh-CN',
      en: '/sign-in?lang=en',
      ja: '/sign-in?lang=ja',
    },
  },
}

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Futari · ふたり',
  alternateName: ['Futari 家計簿', '兩個人的家計簿', 'ふたり 家計簿'],
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web, iOS, Android (PWA)',
  description:
    '專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。',
  url: `${APP_URL}/sign-in`,
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

export default async function SignInPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()])

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-between px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <script
        type="application/ld+json"
        // Static SoftwareApplication schema → structured-data signals to crawlers.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />

      <div className="flex-1" />

      <div className="flex flex-col items-center text-center gap-3">
        <h1
          className="text-amount-md leading-none tracking-[-1px] m-0"
          style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
        >
          Futari
          <span className="sr-only"> · 兩個人的家計簿｜伴侶／夫妻共享記帳 PWA</span>
        </h1>
        <p className="text-sm tracking-[3px] m-0" style={{ color: 'var(--ink-2)' }}>
          ふたり
        </p>
        <p
          className="mt-6 text-base leading-relaxed"
          style={{ color: 'var(--ink-2)', maxWidth: 280 }}
        >
          {t.signIn.tagline}
        </p>
        <p className="sr-only">
          專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center gap-4 mt-12">
        <SignInButton label={t.signIn.continueWithGoogle} />
        <p className="text-xs text-center" style={{ color: 'var(--ink-3)' }}>
          {t.signIn.termsPrefix}{' '}
          <a href="/terms" className="underline">{t.signIn.termsLink}</a>
          {' '}{t.signIn.termsAnd}{' '}
          <a href="/privacy" className="underline">{t.signIn.privacyLink}</a>
          {t.signIn.termsSuffix}
        </p>
      </div>

      <div className="flex-1" />

      <LanguageSwitcher current={locale} variant="footer" />
    </main>
  )
}
