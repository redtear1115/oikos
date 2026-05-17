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
import { PhonePreview } from './PhonePreview'
import { TrustSection } from './TrustSection'

type LandingStrings = Translations['landing']

type Props = {
  t: LandingStrings
  /** 主 CTA — 已登入 → /dashboard；未登入 → 該 locale 的 /sign-in。 */
  ctaHref: string
  /** 「已有帳號」次要 link — 永遠指 sign-in（locale-aware）。 */
  signInHref: string
  languageSwitcher?: ReactNode
}

// Public landing page. Mobile-first (single column, 2×2 feature grid),
// promoted to a two-column hero + 4-column feature row at md+ (>=768px).
// All copy is i18n-driven via t.landing — see Translations type.

export function Landing({ t, ctaHref, signInHref, languageSwitcher }: Props) {
  return (
    <main
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: 'var(--bg)',
        color: 'var(--ink)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
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
            className="text-[17px] md:text-[22px] font-medium"
            style={{
              fontFamily: 'var(--font-fraunces)',
              letterSpacing: '-0.2px',
            }}
          >
            Futari
          </span>
          <span
            className="hidden md:inline text-[11px] ml-2"
            style={{ color: 'var(--ink-2)', letterSpacing: '3px' }}
          >
            ふたり
          </span>
        </div>

        {/* Desktop CTA in top-right; mobile relies on hero CTA only */}
        <Link
          href={ctaHref}
          className="hidden md:inline-flex items-center justify-center h-10 px-5 rounded-xl text-white text-[14px] font-semibold cursor-pointer"
          style={{
            background: 'var(--ink)',
            letterSpacing: '1.2px',
            textDecoration: 'none',
          }}
        >
          {t.cta}
        </Link>
      </header>

      {/* HERO — single column on mobile, two columns on md+ */}
      <section className="relative z-10 px-6 md:px-16 pt-10 md:pt-12 pb-12 md:pb-20 max-w-md md:max-w-none mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:gap-10 md:max-w-[1280px] md:mx-auto">
          {/* Copy block */}
          <div className="text-center md:text-left md:w-[600px] md:shrink-0">
            {/* mobile: large mark above title */}
            <div className="md:hidden flex justify-center mb-7">
              <FutariMark size={88} />
            </div>

            {/* desktop: small kicker above title */}
            <p
              className="hidden md:block m-0 mb-6"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 13,
                color: 'var(--accent)',
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
                fontSize: 'clamp(56px, 8vw, 96px)',
              }}
            >
              {/* mobile: "Futari" word as logotype */}
              <span className="md:hidden">Futari</span>
              {/* desktop: tagline as the giant headline */}
              <span
                className="hidden md:inline"
                style={{ letterSpacing: '-3.5px' }}
                dangerouslySetInnerHTML={{ __html: t.taglineHtml }}
              />
            </h1>

            {/* mobile only: ふたり kana under Futari */}
            <p
              className="md:hidden mt-3 m-0"
              style={{ color: 'var(--ink-2)', fontSize: 13, letterSpacing: '4px' }}
            >
              ふたり
            </p>

            {/* mobile only: tagline as secondary headline */}
            <p
              className="md:hidden mt-9 m-0"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontSize: 26,
                fontWeight: 400,
                lineHeight: 1.45,
                letterSpacing: '-0.3px',
              }}
              dangerouslySetInnerHTML={{ __html: t.taglineHtml }}
            />

            {/* body — both layouts */}
            <p
              className="m-0 mt-5 md:mt-7 text-[15px] md:text-[18px] leading-[1.7] md:leading-[1.7] mx-auto md:mx-0"
              style={{
                color: 'var(--ink-2)',
                maxWidth: 320,
              }}
              dangerouslySetInnerHTML={{ __html: t.bodyHtml }}
            />

            {/* CTA row */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mt-10">
              <Link
                href={ctaHref}
                className="flex items-center justify-center w-full md:w-auto md:px-8 h-[54px] md:h-14 rounded-2xl md:rounded-[14px] text-white text-[16px] font-semibold cursor-pointer"
                style={{
                  background: 'var(--ink)',
                  letterSpacing: '1.8px',
                  textDecoration: 'none',
                  boxShadow: '0 10px 24px -10px rgba(58, 36, 25, 0.4)',
                }}
              >
                {t.cta}
              </Link>
              <Link
                href={signInHref}
                className="hidden md:inline-flex items-center justify-center h-14 px-5 rounded-[14px] text-[14px] cursor-pointer"
                style={{
                  color: 'var(--ink-2)',
                  letterSpacing: '1px',
                  textDecoration: 'none',
                }}
              >
                {t.alreadyHaveAccount}
              </Link>
            </div>

            {/* Mobile sub-CTA hint */}
            <p
              className="md:hidden m-0 mt-3 text-center text-[12px]"
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

          {/* Phone preview — desktop only */}
          <div className="hidden md:flex flex-1 items-center justify-center">
            <PhonePreview t={t} />
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
                  color: 'var(--accent)',
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
              className="hidden md:block m-0 text-[14px]"
              style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 320 }}
              dangerouslySetInnerHTML={{ __html: t.featuresSubtitleHtml }}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            <FeatureCard
              kicker="01"
              chipColor="var(--accent)"
              chipBg="var(--accent-soft)"
              title={t.f1Title}
              body={t.f1Body}
              glyph={<DuoGlyph />}
            />
            <FeatureCard
              kicker="02"
              chipColor="var(--asset-color-house)"
              chipBg="var(--asset-tint-house)"
              title={t.f2Title}
              body={t.f2Body}
              glyph={<AssetGlyph />}
            />
            <FeatureCard
              kicker="03"
              chipColor="var(--saving)"
              chipBg="var(--asset-tint-insurance)"
              title={t.f3Title}
              body={t.f3Body}
              glyph={<ShieldGlyph />}
            />
            <FeatureCard
              kicker="04"
              chipColor="var(--ink)"
              chipBg="#EFE2D2"
              title={t.f4Title}
              body={t.f4Body}
              glyph={<StatsGlyph />}
            />
          </div>
        </div>
      </section>

      {/* TRUST — public-facing trust statement (#538). Sits between Features
          and Footer so it lands in the user's decision moment. */}
      <TrustSection t={t} variant="full" />

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
          <span className="text-[12px]" style={{ letterSpacing: '0.3px' }}>
            {t.footerTrust}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {languageSwitcher}
          <span
            className="text-[11px]"
            style={{ color: 'var(--ink-2)', letterSpacing: '2px' }}
          >
            © 2026 · MADE IN TAIWAN
          </span>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({
  kicker,
  chipColor,
  chipBg,
  title,
  body,
  glyph,
}: {
  kicker: string
  chipColor: string
  chipBg: string
  title: string
  body: string
  glyph: ReactNode
}) {
  return (
    <div
      className="p-4 md:p-6 flex flex-col rounded-[18px] md:rounded-[22px]"
      style={{ background: 'var(--surface)', minHeight: 168 }}
    >
      <div className="flex items-center justify-between mb-3 md:mb-[22px]">
        <div
          className="flex items-center justify-center w-[38px] h-[38px] md:w-12 md:h-12 rounded-[12px] md:rounded-[14px]"
          style={{ background: chipBg, color: chipColor }}
        >
          {glyph}
        </div>
        <span
          className="text-[13px] md:text-[16px]"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontStyle: 'italic',
            color: 'var(--ink-2)',
            letterSpacing: '0.5px',
          }}
        >
          {kicker}
        </span>
      </div>
      <p
        className="m-0 mb-1.5 md:mb-2 text-[15px] md:text-[19px] font-semibold"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {title}
      </p>
      <p
        className="m-0 text-[12px] md:text-[13.5px] leading-[1.55] md:leading-[1.7]"
        style={{ color: 'var(--ink-2)' }}
      >
        {body}
      </p>
    </div>
  )
}
