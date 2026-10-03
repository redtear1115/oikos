import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { preload } from 'react-dom'
import { SUPPORTED_LOCALES, isLocale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'

const FRAUNCES_LATIN =
  '/fonts/fraunces/6NUu8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib14c7qv8oRcTn.woff2'

// Brand-page-only CSS, rendered here rather than in globals.css: that file is
// the render-blocking stylesheet of every route, and ~230 extra bytes in it
// pushed /zh-TW's simulated mobile LCP from 2.47 s to 2.62 s (#1522). Inline
// <style> keeps the cost to the brand pages' own HTML, where the same budget
// applies (landing gzip ~29.1 KB): keep this string short.
// - .skip: the skip link is off-screen until it takes keyboard focus (#1523).
// - forced-colors: filled CTAs are `border-0` fills; under forced colors the
//   fill becomes Canvas and the control loses its edge entirely (no error, the
//   button just looks like loose text). The media query gives them a border the
//   UA does render and changes nothing outside forced-colors. The sign-in
//   buttons get theirs from the sign-in page (SignInButton.tsx is a native
//   contract file and is not edited for this).
const BRAND_CSS =
  '.skip{position:fixed;left:8px;top:8px;z-index:60;padding:12px 16px;border-radius:var(--radius-bubble);background:var(--ink);color:var(--on-fill);transform:translateY(-200%)}' +
  '.skip:focus{transform:none}' +
  '@media(forced-colors:active){.skip,.fc-edge{border:1px solid ButtonText}}'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  // Brand pages paint their headline in Fraunces, whose latin subset (one
  // variable file covers both 400 and 500) is otherwise discovered only after
  // the CSS is parsed: document → CSS → font is three serial round trips.
  // Lighthouse's simulated LCP charges that whole chain to text LCP, and it
  // was the largest single term in the G1 failure (#1520: blocking the font
  // dropped simulated LCP on /use-case from 3.28 s to 2.26 s). Preloading
  // this one 36 KB file, rather than every unicode-range chunk, keeps the
  // #454 / #572 lesson intact — the CJK subsets were the expensive ones.
  // Scoped to app/[locale] so the dashboard does not pay for it.
  preload(FRAUNCES_LATIN, { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  // Site-wide identity JSON-LD (#669 M-11). WebSite (sitelinks search box hint)
  // and Organization (brand identity) describe the whole site, so they render
  // once here for every public locale page rather than being duplicated per
  // page. name / alternateName follow the URL locale so each canonical URL's
  // schema language matches its rendered content.
  //
  // Stable @id + cross-references (#702): WebSite/Organization here and
  // SoftwareApplication on the landing (app/[locale]/page.tsx) each carry an
  // @id, and reference each other by @id, so crawlers merge the separate
  // <script> blocks into one connected entity graph instead of three orphans.
  const t = dictionaries[locale]
  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${APP_URL}/#website`,
    name: t.landing.jsonLdAppName,
    alternateName: t.landing.jsonLdAlternateNames,
    url: APP_URL,
    inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
    publisher: { '@id': `${APP_URL}/#organization` },
  }
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${APP_URL}/#organization`,
    name: 'Futari',
    url: APP_URL,
    logo: `${APP_URL}/icons/apple-touch-icon.png`,
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
      {/* `display: contents` wrapper: carries the brand-only line-breaking
          rules in globals.css (.brand, #1522) without adding a box. */}
      <div className="brand">
        <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
        <a href="#main" className="skip text-sm no-underline">
          {t.brand.skipToMain}
        </a>
        {children}
      </div>
    </>
  )
}
