import type { Metadata } from 'next'
import Link from 'next/link'
import { isLocale, type Locale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { buildAlternates, ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'
import { localizedHref } from '@/lib/i18n/path'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { fetchBlogPosts } from '@/lib/blog-feed'
import { SignInButton } from './SignInButton'
import { InstallHint } from './InstallHint'
import { FeatureCards } from './FeatureCards'
import { BlogSection } from './BlogSection'

type AboutStrings = Translations['signIn']['about']

type Params = Promise<{ locale: string }>

// AboutNarrative picks a random featured article per request (silent rotation
// — one story per visit, others kept in DOM via sr-only for SEO). Without
// force-dynamic, Next would cache the static-ish sign-in page and freeze
// whichever article won at build time.
export const dynamic = 'force-dynamic'

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
      siteName: 'Futari · 雙人記帳',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: t.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t.title,
      description: t.ogDescription,
      images: [ogImage(locale)],
    },
  }
}

export default async function SignInPage({ params }: { params: Params }) {
  const [{ locale: raw }, blogPosts] = await Promise.all([params, fetchBlogPosts()])
  if (!isLocale(raw)) return null
  const locale: Locale = raw
  const t = dictionaries[locale]

  return (
    <main
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--bg-committed)' }}
    >
      {/* Warm TLS to Google's OAuth host so the post-click redirect costs less.
          Supabase preconnect lives in the root layout (covers every page);
          accounts.google.com is sign-in-specific. (#352) */}
      <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://accounts.google.com" />
      <link rel="preconnect" href="https://appleid.apple.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://appleid.apple.com" />

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
            standalone punchline (Fraunces, italic, larger spacing). Only one
            section is visually featured per request — see AboutNarrative. */}
        <section
          className="order-2 flex flex-col lg:order-1"
          aria-label="About"
          data-shell-slot="left"
        >
          <AboutNarrative
            about={t.signIn.about}
            featuredIndex={Math.floor(Math.random() * 7)}
          />
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
              <span className="sr-only">{t.signIn.srTagline}</span>
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
            <p className="sr-only">{t.signIn.srDescription}</p>
          </div>

          <div className="w-full max-w-sm flex flex-col items-center gap-4 mt-12">
            <SignInButton provider="google" label={t.signIn.continueWithGoogle} />
            <SignInButton provider="apple" label={t.signIn.continueWithApple} />
            <InstallHint t={t.signIn.installHint} />
            <p className="text-xs text-center" style={{ color: 'var(--ink-3)' }}>
              {t.signIn.termsPrefix}{' '}
              <Link href={localizedHref('/terms', locale)} className="underline">{t.signIn.termsLink}</Link>
              {' '}{t.signIn.termsAnd}{' '}
              <Link href={localizedHref('/privacy', locale)} className="underline">{t.signIn.privacyLink}</Link>
              {t.signIn.termsSuffix}
            </p>
          </div>
        </section>

        {/* Right column: 4 scene-style feature cards (#417). */}
        <section
          className="order-3 flex flex-col"
          aria-label="Features"
          data-shell-slot="right"
        >
          <FeatureCards t={t.signIn.features} />
        </section>
      </div>

      <BlogSection posts={blogPosts} t={t} locale={locale} />

      <div className="flex justify-center px-6 py-6">
        <LanguageSwitcher current={locale} variant="footer" />
      </div>
    </main>
  )
}

// Silent rotation: ONE article visible per request, the other 6 rendered as
// sr-only so SEO crawlers and screen readers still see the full long-form
// content. Repeat visitors organically discover different stories — no
// carousel UI, no "next" button (sign-in is "安靜的邀請" tone).
function AboutNarrative({
  about,
  featuredIndex,
}: {
  about: AboutStrings
  featuredIndex: number
}) {
  const sections: { heading: string; body: string[]; punchlineLast?: boolean }[] = [
    { heading: about.s1Heading, body: about.s1Body },
    { heading: about.s2Heading, body: about.s2Body },
    { heading: about.s3Heading, body: about.s3Body },
    { heading: about.s4Heading, body: about.s4Body },
    { heading: about.s5Heading, body: about.s5Body, punchlineLast: true },
    { heading: about.s6Heading, body: about.s6Body },
    { heading: about.s7Heading, body: about.s7Body },
  ]
  const safeIndex = ((featuredIndex % sections.length) + sections.length) % sections.length
  const featured = sections[safeIndex]
  const others = sections.filter((_, i) => i !== safeIndex)
  const lastIdx = featured.body.length - 1

  return (
    <div className="flex flex-col gap-10 lg:gap-12">
      <article className="about-article flex flex-col gap-4">
        <h2
          className="m-0 text-[19px] lg:text-title leading-snug"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: '-0.3px',
          }}
        >
          {featured.heading}
        </h2>
        {featured.body.map((p, j) => {
          const isPunchline = featured.punchlineLast && j === lastIdx
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
              className="m-0 text-sm lg:text-base leading-[1.85]"
              style={{ color: 'var(--ink-2)' }}
            >
              {p}
            </p>
          )
        })}
        <p
          className="m-0 mt-4 text-sm lg:text-sm leading-relaxed italic"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontWeight: 400,
            color: 'var(--ink-3)',
            letterSpacing: '-0.05px',
          }}
        >
          {about.moreStoriesHint}
        </p>
      </article>

      {/* Non-featured sections — visually hidden but in the DOM so search
          engines and assistive tech still see the full long-form content. */}
      {others.map((s, i) => (
        <article key={i} className="sr-only">
          <h2>{s.heading}</h2>
          {s.body.map((p, j) => (
            <p key={j}>{p}</p>
          ))}
        </article>
      ))}
    </div>
  )
}
