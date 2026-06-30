import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import {
  FutariMark,
  DuoGlyph,
  AssetGlyph,
  ShieldGlyph,
  StatsGlyph,
  ShieldOutlineGlyph,
} from './FutariMark'
import { IllustrationSlot } from './IllustrationSlot'
import { LandingCtaLink } from './LandingCtaLink'
import { LandingPrimaryCta } from './LandingPrimaryCta'
import { LandingStandaloneRedirect } from './LandingStandaloneRedirect'
import { PhonePreview } from './PhonePreview'
import { TrustSection } from './TrustSection'

type LandingStrings = Translations['landing']

type Props = {
  t: LandingStrings
  /** 「已有帳號」次要 link + 主 CTA 的 SSR 預設 — 永遠指 sign-in（locale-aware）。
   *  主 CTA 在 client hydrate 後若偵測到 session，會改指 dashboardHref (#920 P1)。 */
  signInHref: string
  /** 主 CTA 已登入時的目的地（/dashboard）— client-side 才會切過去。 */
  dashboardHref: string
  /** Locale-aware /use-case/* hrefs (#851). Three internal links to
   *  situational SEO landing pages for long-tail keyword traffic. */
  useCaseHrefs: {
    cohabitation: string
    newlyweds: string
    petOwners: string
  }
  /** Locale-aware /migrate/* hrefs (#613). Three internal links to strengthen
   *  the link graph for SEO and offer cross-tool migrants a direct path. */
  migrateHrefs: {
    honeydue: string
    spendee: string
    cwmoney: string
  }
  /** Legal page links — kept in the landing footer so /terms and /privacy
   *  have inbound link equity from a high-authority crawlable page. /sign-in
   *  also links them but is robots-disallowed, so its links don't count. (#669 M-6) */
  legalLinks: {
    termsHref: string
    termsLabel: string
    privacyHref: string
    privacyLabel: string
  }
  languageSwitcher?: ReactNode
}

// Public landing page. Mobile-first (single column, 2×2 feature grid),
// promoted to a two-column hero + 4-column feature row at md+ (>=768px).
// All copy is i18n-driven via t.landing — see Translations type.

export function Landing({ t, signInHref, dashboardHref, useCaseHrefs, migrateHrefs, legalLinks, languageSwitcher }: Props) {
  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: 'var(--bg-committed)',
        color: 'var(--ink)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* #949 — installed-app (PWA / Capacitor) signed-in users skip the public
          landing and go straight to the dashboard. No-op in a browser tab. */}
      <LandingStandaloneRedirect dashboardHref={dashboardHref} />

      {/* Decorative faint mark — desktop only, hidden on mobile */}
      <div
        aria-hidden
        className="hidden md:block absolute pointer-events-none"
        style={{ right: -120, top: 40, opacity: 0.06 }}
      >
        <FutariMark size={520} />
      </div>

      {/* TOP BAR */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 pt-3 md:pt-6 pb-1">
        <div className="flex items-center gap-2">
          <FutariMark size={22} />
          <span
            className="text-[17px] md:text-title font-medium"
            style={{
              fontFamily: 'var(--font-fraunces)',
              letterSpacing: '-0.2px',
            }}
          >
            Futari
          </span>
          <span
            className="hidden md:inline text-xs ml-2"
            style={{ color: 'var(--ink-2)', letterSpacing: '3px' }}
          >
            ふたり
          </span>
        </div>

        {/* Desktop CTA in top-right; mobile relies on hero CTA only */}
        <LandingPrimaryCta
          signInHref={signInHref}
          dashboardHref={dashboardHref}
          ctaLocation="desktop_header"
          className="hidden md:inline-flex items-center justify-center h-11 px-5 rounded-xl text-white text-sm font-medium cursor-pointer"
          style={{
            background: 'var(--ink)',
            letterSpacing: '1.2px',
            textDecoration: 'none',
          }}
        >
          {t.cta}
        </LandingPrimaryCta>
      </header>

      {/* HERO — single column on mobile, two columns on md+ */}
      <section className="relative z-10 px-6 md:px-16 pt-10 md:pt-12 pb-12 md:pb-20 max-w-md md:max-w-none mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:gap-10 md:max-w-[1280px] md:mx-auto">
          {/* Copy block */}
          <div className="text-center md:text-left md:w-[520px] md:shrink-0">
            {/* mobile: illustration band leads — replaces the large mark */}
            <div className="md:hidden mb-6 px-1">
              <IllustrationSlot mobile />
            </div>

            {/* mobile only: Futari wordmark + kana, decorative — h1 below
                carries the actual page heading (tagline) so screen-reader
                navigation lands on page purpose, not the brand name. */}
            <p
              className="md:hidden m-0 text-center"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 500,
                letterSpacing: '-1.5px',
                fontSize: 'clamp(56px, 14vw, 84px)',
                lineHeight: 1,
              }}
            >
              Futari
            </p>
            {/* desktop: small kicker above title */}
            <p
              className="hidden md:block m-0 mb-6"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 13,
                color: 'var(--ink-2)',
                letterSpacing: '4px',
              }}
            >
              {t.heroKicker}
            </p>

            <h1
              className="m-0 leading-none md:leading-[1]"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 500,
                letterSpacing: '-1.5px',
              }}
            >
              {/* mobile: tagline scaled up to carry the fold as the sole
                  visual main character (brief #832 phase 1). The 2-line
                  block at this size visually outweighs the wordmark above
                  even though per-character it's smaller; lh 1.15 keeps
                  the block tight, letter-spacing -1px tightens CJK rhythm. */}
              <span
                className="md:hidden block"
                style={{
                  fontSize: 'clamp(34px, 9vw, 56px)',
                  fontWeight: 400,
                  lineHeight: 1.15,
                  letterSpacing: '-1px',
                }}
                dangerouslySetInnerHTML={{ __html: t.taglineHtml }}
              />
              {/* desktop: tagline as the giant headline */}
              <span
                className="hidden md:inline"
                style={{
                  fontSize: 'clamp(56px, 8vw, 96px)',
                  letterSpacing: '-3.5px',
                }}
                dangerouslySetInnerHTML={{ __html: t.taglineHtml }}
              />
            </h1>

            {/* body — both layouts */}
            <p
              className="m-0 mt-5 md:mt-7 text-base md:text-[18px] leading-[1.7] md:leading-[1.7] mx-auto md:mx-0"
              style={{
                color: 'var(--ink-2)',
                maxWidth: 320,
              }}
              dangerouslySetInnerHTML={{ __html: t.bodyHtml }}
            />

            {/* CTA row */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mt-10">
              <LandingPrimaryCta
                signInHref={signInHref}
                dashboardHref={dashboardHref}
                ctaLocation="hero"
                className="flex items-center justify-center w-full md:w-auto md:px-8 h-[54px] md:h-14 rounded-2xl md:rounded-bubble text-white text-base font-medium cursor-pointer"
                style={{
                  background: 'var(--ink)',
                  letterSpacing: '1.8px',
                  textDecoration: 'none',
                  boxShadow: '0 10px 24px -10px rgba(58, 36, 25, 0.4)',
                }}
              >
                {t.cta}
              </LandingPrimaryCta>
              <LandingCtaLink
                href={signInHref}
                ctaLocation="secondary"
                target="sign_in"
                className="hidden md:inline-flex items-center justify-center h-14 px-5 rounded-bubble text-sm cursor-pointer"
                style={{
                  color: 'var(--ink-2)',
                  letterSpacing: '1px',
                  textDecoration: 'none',
                }}
              >
                {t.alreadyHaveAccount}
              </LandingCtaLink>
            </div>

            {/* Mobile sub-CTA hint */}
            <p
              className="md:hidden m-0 mt-3 text-center text-xs"
              style={{ color: 'var(--ink-2)', letterSpacing: '0.3px' }}
            >
              {t.ctaHint}
            </p>

            {/* Trust row — desktop only; full version lives below the
                Features section (see <TrustSection variant="full" /> below). */}
            <div className="hidden md:block mt-7">
              <TrustSection t={t} variant="compact" />
            </div>
          </div>

          {/* Illustration + demoted phone — desktop only */}
          <div className="hidden md:flex flex-1 self-stretch relative min-h-[420px] items-stretch py-2">
            <IllustrationSlot />
            {/* PhonePreview demoted to secondary product proof — overlaps illo corner */}
            <div className="hidden lg:block absolute right-[-8px] bottom-6 z-10">
              <PhonePreview t={t} scale={0.78} />
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — 2 columns on mobile, 4 columns on md+ */}
      <section
        className="relative z-10 px-5 md:px-16 pt-12 md:pt-16 pb-12 md:pb-16"
        style={{ background: 'var(--surface-alt)' }}
      >
        <div className="max-w-md md:max-w-[1280px] mx-auto">
          {/* section heading */}
          <div className="md:flex md:items-baseline md:justify-between mb-6 md:mb-9 px-1">
            <div>
              <p
                className="m-0"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontSize: 12,
                  letterSpacing: '3.5px',
                  color: 'var(--ink-2)',
                }}
              >
                {t.featuresKicker}
              </p>
              <h2
                className="m-0 mt-1.5 text-[20px] md:text-[36px]"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontWeight: 500,
                  letterSpacing: '-0.5px',
                }}
              >
                {t.featuresTitle}
              </h2>
            </div>
            <p
              className="hidden md:block m-0 text-sm"
              style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 320 }}
              dangerouslySetInnerHTML={{ __html: t.featuresSubtitleHtml }}
            />
          </div>

          {/* Editorial column: hanging Fraunces numeral + glyph-accented title
              + body. No card chrome; rhythm comes from hairline dividers and
              vertical spacing. 2 columns on desktop, single column on mobile. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-0 md:gap-y-0 md:gap-x-12 lg:gap-x-20">
            <FeatureEntry
              kicker="01"
              glyphColor="var(--accent)"
              title={t.f1Title}
              body={t.f1Body}
              glyph={<DuoGlyph />}
            />
            <FeatureEntry
              kicker="02"
              glyphColor="var(--asset-color-house)"
              title={t.f2Title}
              body={t.f2Body}
              glyph={<AssetGlyph />}
            />
            <FeatureEntry
              kicker="03"
              glyphColor="var(--saving)"
              title={t.f3Title}
              body={t.f3Body}
              glyph={<ShieldGlyph />}
            />
            <FeatureEntry
              kicker="04"
              glyphColor="var(--ink)"
              title={t.f4Title}
              body={t.f4Body}
              glyph={<StatsGlyph />}
              isLast
            />
          </div>
        </div>
      </section>

      {/* TRUST — public-facing trust statement (#538). Sits between Features
          and Footer so it lands in the user's decision moment. */}
      <TrustSection t={t} variant="full" />

      {/* USE CASE — three situational /use-case/* links (#851). Strengthens
          long-tail keyword SEO with intent-driven internal links. */}
      <UseCaseLinksSection t={t} useCaseHrefs={useCaseHrefs} />

      {/* MIGRATE — three locale-aware /migrate/* links (#613). Strengthens the
          internal link graph for SEO and gives visitors arriving from another
          tool a direct next step. */}
      <MigrateLinksSection t={t} migrateHrefs={migrateHrefs} />

      {/* FOOTER */}
      <footer
        className="relative z-10 px-6 md:px-16 py-8 md:py-6 flex flex-col md:flex-row items-center md:justify-between gap-4"
        style={{
          background: 'var(--surface-alt)',
          borderTop: '1px solid var(--hairline)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)',
        }}
      >
        <div
          className="flex items-center gap-2 md:gap-2 text-center md:text-left"
          style={{ color: 'var(--ink-2)' }}
        >
          <ShieldOutlineGlyph />
          <span className="text-xs" style={{ letterSpacing: '0.3px' }}>
            {t.footerTrust}
          </span>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
          <div
            className="flex items-center gap-3 text-[12px]"
            style={{ color: 'var(--ink-2)', letterSpacing: '0.3px' }}
          >
            <Link href={legalLinks.termsHref} className="underline">{legalLinks.termsLabel}</Link>
            <span aria-hidden="true" style={{ color: 'var(--hairline)' }}>·</span>
            <Link href={legalLinks.privacyHref} className="underline">{legalLinks.privacyLabel}</Link>
          </div>
          <div className="flex items-center gap-3">
            {languageSwitcher}
            <span
              className="text-xs"
              style={{ color: 'var(--ink-2)', letterSpacing: '2px' }}
            >
              © 2026 · MADE IN TAIWAN
            </span>
          </div>
        </div>
      </footer>
    </main>
  )
}

function MigrateLinksSection({
  t,
  migrateHrefs,
}: {
  t: LandingStrings
  migrateHrefs: Props['migrateHrefs']
}) {
  const items = [
    {
      href: migrateHrefs.honeydue,
      source: 'Honeydue',
      target: 'migrate_honeydue' as const,
      title: t.migrateSection.honeydueTitle,
      body: t.migrateSection.honeydueBody,
    },
    {
      href: migrateHrefs.spendee,
      source: 'Spendee',
      target: 'migrate_spendee' as const,
      title: t.migrateSection.spendeeTitle,
      body: t.migrateSection.spendeeBody,
    },
    {
      href: migrateHrefs.cwmoney,
      source: 'CWMoney',
      target: 'migrate_cwmoney' as const,
      title: t.migrateSection.cwmoneyTitle,
      body: t.migrateSection.cwmoneyBody,
    },
  ]

  return (
    <section
      className="relative z-10 px-5 md:px-16 py-12 md:py-16"
      style={{ background: 'var(--surface-alt)' }}
    >
      <div className="max-w-md md:max-w-[1080px] mx-auto">
        <div className="text-center md:text-left md:flex md:items-baseline md:justify-between md:gap-10 mb-7 md:mb-9">
          <div>
            <p
              className="m-0"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 12,
                letterSpacing: '3.5px',
                color: 'var(--ink-2)',
              }}
            >
              {t.migrateSection.kicker}
            </p>
            <h2
              className="m-0 mt-1.5 text-[20px] md:text-[28px]"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 500,
                letterSpacing: '-0.3px',
              }}
            >
              {t.migrateSection.title}
            </h2>
          </div>
          <p
            className="m-0 mt-3 md:mt-0 text-[13px] md:text-sm"
            style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 360 }}
          >
            {t.migrateSection.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {items.map((item) => (
            <LandingCtaLink
              key={item.source}
              href={item.href}
              ctaLocation="footer_migrate"
              target={item.target}
              // No custom aria-label: the visible title + body already
              // self-describe the card, so the accessible name is computed from
              // them — satisfying WCAG 2.5.3 Label in Name (#919). A bespoke
              // aria-label ("從 X 搬到 Futari") wouldn't contain the visible
              // "搬過來" text and failed label-content-name-mismatch.
              className="block p-5 md:p-6 rounded-tile md:rounded-[18px] transition-colors"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              <p
                className="m-0 text-base md:text-[16px] font-medium"
                style={{ color: 'var(--ink)', letterSpacing: '-0.1px' }}
              >
                {item.title}
              </p>
              <p
                className="m-0 mt-1.5 text-sm md:text-[13px] leading-[1.6]"
                style={{ color: 'var(--ink-2)' }}
              >
                {item.body}
              </p>
            </LandingCtaLink>
          ))}
        </div>
      </div>
    </section>
  )
}

function UseCaseLinksSection({
  t,
  useCaseHrefs,
}: {
  t: LandingStrings
  useCaseHrefs: Props['useCaseHrefs']
}) {
  const items: Array<{ href: string; slug: string; target: 'use_case_cohabitation' | 'use_case_newlyweds' | 'use_case_pet_owners'; title: string; body: string }> = [
    {
      href: useCaseHrefs.cohabitation,
      slug: 'cohabitation',
      target: 'use_case_cohabitation',
      title: t.useCaseSection.cohabitationTitle,
      body: t.useCaseSection.cohabitationBody,
    },
    {
      href: useCaseHrefs.newlyweds,
      slug: 'newlyweds',
      target: 'use_case_newlyweds',
      title: t.useCaseSection.newlywedsTitle,
      body: t.useCaseSection.newlywedsBody,
    },
    {
      href: useCaseHrefs.petOwners,
      slug: 'pet-owners',
      target: 'use_case_pet_owners',
      title: t.useCaseSection.petOwnersTitle,
      body: t.useCaseSection.petOwnersBody,
    },
  ]

  return (
    <section
      className="relative z-10 px-5 md:px-16 py-12 md:py-16"
      style={{ background: 'var(--bg)' }}
    >
      <div className="max-w-md md:max-w-[1080px] mx-auto">
        <div className="text-center md:text-left md:flex md:items-baseline md:justify-between md:gap-10 mb-7 md:mb-9">
          <div>
            <p
              className="m-0"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 12,
                letterSpacing: '3.5px',
                color: 'var(--ink-2)',
              }}
            >
              {t.useCaseSection.kicker}
            </p>
            <h2
              className="m-0 mt-1.5 text-[20px] md:text-[28px]"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontWeight: 500,
                letterSpacing: '-0.3px',
              }}
            >
              {t.useCaseSection.title}
            </h2>
          </div>
          <p
            className="m-0 mt-3 md:mt-0 text-[13px] md:text-sm"
            style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 360 }}
          >
            {t.useCaseSection.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {items.map((item) => (
            <LandingCtaLink
              key={item.slug}
              href={item.href}
              ctaLocation="footer_use_case"
              target={item.target}

              className="block p-5 md:p-6 rounded-tile md:rounded-[18px] transition-colors"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              <p
                className="m-0 text-base md:text-[16px] font-medium"
                style={{ color: 'var(--ink)', letterSpacing: '-0.1px' }}
              >
                {item.title}
              </p>
              <p
                className="m-0 mt-1.5 text-sm md:text-[13px] leading-[1.6]"
                style={{ color: 'var(--ink-2)' }}
              >
                {item.body}
              </p>
            </LandingCtaLink>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureEntry({
  kicker,
  glyphColor,
  title,
  body,
  glyph,
  isLast,
}: {
  kicker: string
  glyphColor: string
  title: string
  body: string
  glyph: ReactNode
  /** Suppress the bottom hairline on the last entry per column (avoids a
   *  trailing rule before the next section). On desktop the right column's
   *  entry #4 still tracks #3's height; the missing divider reads as the end. */
  isLast?: boolean
}) {
  return (
    <div
      className="flex gap-5 md:gap-6 py-6 md:py-8"
      style={{
        borderBottom: isLast ? undefined : '1px solid var(--hairline)',
      }}
    >
      {/* Hanging italic numeral — the signature gesture. Reserves a narrow
          column on the left so titles align across entries. */}
      <span
        aria-hidden="true"
        className="shrink-0 text-[28px] md:text-[36px] leading-none pt-1"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontStyle: 'italic',
          fontWeight: 400,
          color: 'var(--ink-3)',
          letterSpacing: '-0.5px',
          minWidth: 44,
        }}
      >
        {kicker}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-2 md:mb-2.5">
          <span aria-hidden="true" style={{ color: glyphColor }}>
            {glyph}
          </span>
          <h3
            className="m-0 text-[18px] md:text-[20px] font-medium"
            style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
          >
            {title}
          </h3>
        </div>
        <p
          className="m-0 text-sm md:text-base leading-[1.65] md:leading-[1.7]"
          style={{ color: 'var(--ink-2)' }}
        >
          {body}
        </p>
      </div>
    </div>
  )
}
