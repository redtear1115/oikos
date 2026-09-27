import type { Metadata, Viewport } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { IS_PROD_DEPLOY } from '@/lib/deployEnv'
import { InAppBrowserGuardLazy } from '@/components/InAppBrowserGuardLazy'
import { PostHogProvider } from './providers'
import { PostHogPageView } from './posthog-pageview'
import { VercelInsights } from './vercel-insights'
import './globals.css'
// Fraunces is the landing hero typeface. Two weights (400 mobile tagline, 500
// everything else). Self-hosted from public/fonts/ rather than next/font/google:
// that loader downloads every woff2 at build time and aborts the build if any
// single fetch fails, which is a coin flip on every deploy. (#978 — see
// scripts/fetch-google-fonts.mjs)
//
// The old `preload: false` behaviour carries over for free: plain @font-face CSS
// emits no <link rel="preload">, so the unicode-range subsets stay off the LCP
// critical path (they were costing ~1.9s on mobile). `display: swap` still
// prevents FOIT, so the trade-off remains a brief FOUT on the hero headline.
// Same reasoning applies to Noto Sans TC in the dashboard layout. (#454 / #572)
import './fonts/fraunces.css'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// GA4 Measurement ID — hardcoded because it's a public identifier (the same
// string is visible in every prod HTML via gtag.js, so an env var adds no
// secrecy). Pairs with components/KofiWidget.tsx's SOURCE constant: both are
// fork points when cloning this codebase to wildcard / blog — change them
// together.
//
// Injected only on the production *deployment* (#1116). This comment used to
// say the previous `NODE_ENV === 'production'` gate kept "dev / preview clean
// of gtag.js without per-environment config" — that inference is wrong, and
// it is recorded here rather than deleted because it is an easy one to
// re-derive: a Vercel preview deployment is also `NODE_ENV=production`, so
// every preview, and every local `next build && next start`, was loading
// gtag.js and reporting page_views into the live property. Measured, not
// assumed: a local prod build sent a `g/collect` hit carrying
// `dl=http://localhost/zh-TW`.
//
// This is a gate, never a removal. G-YHXFBMRQ3S is shared across products to
// attribute Ko-fi revenue to its source, so it must keep receiving production
// traffic — the failure direction here is two-sided, and the one that hurts is
// gating prod off by accident: attribution data simply goes to zero one day,
// with no error anywhere. Confirm it is still receiving after deploying.
const GA_MEASUREMENT_ID = 'G-YHXFBMRQ3S'

// Root layout metadata: platform / PWA / icons only.
// Per-page title / description / openGraph / twitter are set in each
// app/[locale]/*/page.tsx via generateMetadata({ params }).
export const metadata: Metadata = {
  // metadataBase resolves all relative metadata URLs (OG image, Twitter card, etc.)
  // against the canonical domain. Without it, Next.js logs warnings + falls back to
  // a guessed origin which is wrong on Vercel preview deployments.
  metadataBase: new URL(APP_URL),
  verification: {
    google: 'bSuzBmlx1niAh9x_ziDQdaOQe3c7aNVgL9C7iIxaGN8',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Futari',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#FBEDE0',
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover lets env(safe-area-inset-*) resolve to real values on
  // Android edge-to-edge PWA — without it they collapse to 0 and silently
  // disable BottomNav/FAB/Sheet safe-area offsets. (#713)
  viewportFit: 'cover',
  // No maximumScale: WCAG 1.4.4 (Resize Text) requires letting users zoom.
  // Inputs are sized at >= 16px to avoid iOS auto-zoom on focus.
  // Android Chrome: shrink the layout viewport when the soft keyboard opens so
  // `dvh`-sized sheets follow the keyboard and inputs stay visible. (#713)
  interactiveWidget: 'resizes-content',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const t = await getTranslations()
  return (
    // suppressHydrationWarning: Android 殼的 SystemBars 原生 plugin 在 hydrate 前
    // 就把 --safe-area-inset-* 寫進 document.documentElement.style（見 #1424）。
    // 只影響 <html> 這一層自己的屬性，不會蓋掉子樹的 hydration mismatch 偵測。
    <html lang={locale} className="font-fraunces" suppressHydrationWarning>
      <head>
        {/* application-name lets Google Search Console and OS install prompts
            associate this PWA with the "雙人記帳" category rather than just
            the brand name "Futari", disambiguating from same-named apps. (#845) */}
        <meta name="application-name" content="Futari 雙人記帳" />
        {/* Supabase preconnect intentionally NOT here: the public landing page
            never talks to Supabase, so warming TLS to it at the root costs every
            landing visitor an unused connection (PageSpeed flagged it as an
            "unused preconnect"). It now lives where it's actually needed —
            app/(dashboard)/layout.tsx (realtime + auth) and the sign-in page
            (OAuth handshake). React hoists those <link>s to <head>. (#352 / #921)

            Google Fonts hints (fonts.googleapis.com / fonts.gstatic.com) also
            removed: the woff2 files are committed under public/fonts/ and served
            same-origin — actually from /_next/static/media/ (Next's CSS
            pipeline bundles the @font-face url()s), not from /fonts/ itself.
            The browser never connects to Google, so the original #511 hints
            were dead weight. (#921 / #978) */}
      </head>
      <body className="antialiased">
        <InAppBrowserGuardLazy strings={t.inAppBrowser} />
        <PostHogProvider>
          <PostHogPageView />
          {children}
        </PostHogProvider>
        <VercelInsights />
        {IS_PROD_DEPLOY && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
      </body>
    </html>
  )
}
