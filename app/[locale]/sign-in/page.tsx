import type { Metadata } from 'next'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { SignInButton } from './SignInButton'
import { buildLocaleUrl, getHreflangAlternates } from '@/lib/i18n/routing'
import { isLocale } from '@/lib/i18n/locales-meta'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

const SIGNIN_TITLE = '登入 Futari · 開始兩個人的記帳生活'
const SIGNIN_DESCRIPTION =
  '用 Google 帳號登入 Futari，開始與伴侶共享家計、紀錄日常開銷與愛車油耗、管理保險與資產的雙人記帳 PWA。'
const SIGNIN_OG_DESCRIPTION = '用 Google 一鍵登入，開始兩個人的家計簿。'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const alternates = getHreflangAlternates('/sign-in', APP_URL)
  const url = buildLocaleUrl('/sign-in', locale)
  return {
    title: SIGNIN_TITLE,
    description: SIGNIN_DESCRIPTION,
    alternates,
    openGraph: {
      title: SIGNIN_TITLE,
      description: SIGNIN_OG_DESCRIPTION,
      url,
      siteName: 'Futari',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: SIGNIN_TITLE,
      description: SIGNIN_OG_DESCRIPTION,
    },
  }
}

export default async function SignInPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()])
  const termsHref = buildLocaleUrl('/terms', locale)
  const privacyHref = buildLocaleUrl('/privacy', locale)

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-between px-6 py-12"
      style={{ background: 'var(--bg)' }}
    >
      <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://accounts.google.com" />

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
          <a href={termsHref} className="underline">{t.signIn.termsLink}</a>
          {' '}{t.signIn.termsAnd}{' '}
          <a href={privacyHref} className="underline">{t.signIn.privacyLink}</a>
          {t.signIn.termsSuffix}
        </p>
      </div>

      <div className="flex-1" />

      <LanguageSwitcher current={locale} variant="footer" />
    </main>
  )
}
