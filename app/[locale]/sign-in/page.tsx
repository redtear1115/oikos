import type { Metadata } from 'next'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import { SignInButton } from './SignInButton'

const SIGNIN_TITLE = '登入 Futari · 開始兩個人的記帳生活'
const SIGNIN_DESCRIPTION =
  '用 Google 帳號登入 Futari，開始與伴侶共享家計、紀錄日常開銷與愛車油耗、管理保險與資產的雙人記帳 PWA。'
const SIGNIN_OG_DESCRIPTION = '用 Google 一鍵登入，開始兩個人的家計簿。'

// hreflang ?lang=xx variants dropped (#392) — cookie-based locale doesn't map to
// canonical URL variants. SoftwareApplication JSON-LD moved to landing (#390).
export const metadata: Metadata = {
  title: SIGNIN_TITLE,
  description: SIGNIN_DESCRIPTION,
  alternates: { canonical: '/sign-in' },
  openGraph: {
    title: SIGNIN_TITLE,
    description: SIGNIN_OG_DESCRIPTION,
    url: '/sign-in',
    siteName: 'Futari',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SIGNIN_TITLE,
    description: SIGNIN_OG_DESCRIPTION,
  },
}

export default async function SignInPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations()])

  return (
    <main
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {/* Warm TLS to Google's OAuth host so the post-click redirect costs less.
          Supabase preconnect lives in the root layout (covers every page);
          accounts.google.com is sign-in-specific. (#352) */}
      <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://accounts.google.com" />

      <div
        className="
          flex flex-1 flex-col gap-12
          px-6 py-12
          lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-3 lg:items-start lg:gap-12
          lg:px-12 lg:py-16
        "
      >
        {/* Left column: about narrative placeholder. Content lands in #416. */}
        <section
          className="order-2 flex flex-col lg:order-1"
          aria-label="About"
          data-shell-slot="left"
        >
          <div
            className="rounded-lg border border-dashed p-6 text-sm leading-relaxed opacity-40"
            style={{ borderColor: 'var(--ink-3)', color: 'var(--ink-2)' }}
          >
            左欄 — about narrative (#416)
          </div>
        </section>

        {/* Center column: existing brand mark + tagline + CTA. */}
        <section
          className="order-1 flex flex-col items-center text-center lg:order-2"
          data-shell-slot="center"
        >
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
        </section>

        {/* Right column: 4 feature cards placeholder. Content lands in #417. */}
        <section
          className="order-3 flex flex-col"
          aria-label="Features"
          data-shell-slot="right"
        >
          <div
            className="rounded-lg border border-dashed p-6 text-sm leading-relaxed opacity-40"
            style={{ borderColor: 'var(--ink-3)', color: 'var(--ink-2)' }}
          >
            右欄 — feature cards (#417)
          </div>
        </section>
      </div>

      <div className="flex justify-center px-6 py-6">
        <LanguageSwitcher current={locale} variant="footer" />
      </div>
    </main>
  )
}
