import type { Metadata, Viewport } from 'next'
import { Fraunces } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { GoogleAnalytics } from '@next/third-parties/google'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { InAppBrowserGuardLazy } from '@/components/InAppBrowserGuardLazy'
import { PostHogProvider } from './providers'
import { PostHogPageView } from './posthog-pageview'
import './globals.css'

// Fraunces is the landing hero typeface. Latin only, two weights (400 mobile
// tagline, 500 everything else). `preload: false` skips the <link rel="preload">
// for every woff2 unicode-range subset — those were putting 12 font files on the
// LCP critical path (~1.9s on mobile, flagged by Lighthouse). `display: swap`
// already prevents FOIT, so the trade-off is a brief FOUT swap on the hero
// headline in exchange for removing the font chain from the critical path.
// Same reasoning applies to Noto Sans TC in the dashboard layout. (issues #454 / #572)
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fraunces',
  display: 'swap',
  preload: false,
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// GA4 Measurement ID — hardcoded because it's a public identifier (the same
// string is visible in every prod HTML via gtag.js, so an env var adds no
// secrecy). Pairs with components/KofiWidget.tsx's SOURCE constant: both are
// fork points when cloning this codebase to wildcard / blog — change them
// together. Only injected when NODE_ENV === 'production' so dev / preview stay
// clean of gtag.js without per-environment config.
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
    <html lang={locale} className={fraunces.variable}>
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
            removed: fonts use next/font/google, which self-hosts the woff2 at
            build time under same-origin /_next/static/media/. The browser never
            connects to Google at runtime, so the original #511 hints were dead
            weight. (#921) */}
      </head>
      <body className="antialiased">
        <InAppBrowserGuardLazy strings={t.inAppBrowser} />
        <PostHogProvider>
          <PostHogPageView />
          {children}
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
        {process.env.NODE_ENV === 'production' && <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />}
      </body>
    </html>
  )
}
