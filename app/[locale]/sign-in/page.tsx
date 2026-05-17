import type { Metadata } from 'next'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { SignInButton } from './SignInButton'

type AboutStrings = Translations['signIn']['about']

type Params = Promise<{ locale: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: raw } = await params
  if (!isLocale(raw)) return {}
  const locale: Locale = raw
  const t = dictionaries[locale].seo.signIn
  return {
    title: t.title,
    description: t.description,
    alternates: buildAlternates('/sign-in', locale),
    openGraph: {
      title: t.title,
      description: t.ogDescription,
      url: localizedHref('/sign-in', locale),
      siteName: 'Futari',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
    },
  }
}

export default async function SignInPage({ params }: { params: Params }) {
  const { locale: raw } = await params
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale]

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
        {/* Left column: about narrative (#416). 7 sections, each with an SEO
            long-tail H2 + 2–4 body paragraphs. s5's last paragraph is a short
            standalone punchline (Fraunces, italic, larger spacing). */}
        <section
          className="order-2 flex flex-col lg:order-1"
          aria-label="About"
          data-shell-slot="left"
        >
          <AboutNarrative about={t.signIn.about} />
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
              <Link href={localizedHref('/terms', locale)} className="underline">{t.signIn.termsLink}</Link>
              {' '}{t.signIn.termsAnd}{' '}
              <Link href={localizedHref('/privacy', locale)} className="underline">{t.signIn.privacyLink}</Link>
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

function AboutNarrative({ about }: { about: AboutStrings }) {
  const sections: { heading: string; body: string[]; punchlineLast?: boolean }[] = [
    { heading: about.s1Heading, body: about.s1Body },
    { heading: about.s2Heading, body: about.s2Body },
    { heading: about.s3Heading, body: about.s3Body },
    { heading: about.s4Heading, body: about.s4Body },
    { heading: about.s5Heading, body: about.s5Body, punchlineLast: true },
    { heading: about.s6Heading, body: about.s6Body },
    { heading: about.s7Heading, body: about.s7Body },
  ]

  return (
    <div className="flex flex-col gap-10 lg:gap-12">
      {sections.map((s, i) => {
        const lastIdx = s.body.length - 1
        return (
          <article key={i} className="flex flex-col gap-4">
            <h2
              className="m-0 text-[19px] lg:text-[22px] leading-snug"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 500,
                color: 'var(--ink)',
                letterSpacing: '-0.3px',
              }}
            >
              {s.heading}
            </h2>
            {s.body.map((p, j) => {
              const isPunchline = s.punchlineLast && j === lastIdx
              if (isPunchline) {
                return (
                  <p
                    key={j}
                    className="m-0 mt-2 text-[17px] lg:text-[19px] leading-relaxed italic"
                    style={{
                      fontFamily: 'var(--font-fraunces)',
                      fontWeight: 400,
                      color: 'var(--ink)',
                      letterSpacing: '-0.1px',
                    }}
                  >
                    {p}
                  </p>
                )
              }
              return (
                <p
                  key={j}
                  className="m-0 text-[14.5px] lg:text-[15px] leading-[1.85]"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {p}
                </p>
              )
            })}
          </article>
        )
      })}
    </div>
  )
}
