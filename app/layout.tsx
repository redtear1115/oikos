import type { Metadata, Viewport } from 'next'
import { Fraunces } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { InAppBrowserGuardLazy } from '@/components/InAppBrowserGuardLazy'
import './globals.css'

// Preconnect target derived once at module load — used to warm TLS to Supabase
// before any real fetch (sign-in OAuth click on public pages, realtime + auth
// on dashboard). Keeps the URL origin only; preconnect ignores the path. (#352)
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
  } catch {
    return null
  }
})()

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

// Root layout metadata: platform / PWA / icons only.
// Per-page title / description / openGraph / twitter are set in each
// app/[locale]/*/page.tsx via generateMetadata({ params }).
export const metadata: Metadata = {
  // metadataBase resolves all relative metadata URLs (OG image, Twitter card, etc.)
  // against the canonical domain. Without it, Next.js logs warnings + falls back to
  // a guessed origin which is wrong on Vercel preview deployments.
  metadataBase: new URL(APP_URL),
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
  // No maximumScale: WCAG 1.4.4 (Resize Text) requires letting users zoom.
  // Inputs are sized at >= 16px to avoid iOS auto-zoom on focus.
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const t = await getTranslations()
  return (
    <html lang={locale} className={fraunces.variable}>
      <head>
        {/* Preconnect to Supabase so the TLS handshake is already done by the
            time the user clicks Sign-In (OAuth) or hits the dashboard. React
            hoists these to <head> automatically; rendering them explicitly in
            <head> keeps the intent clear. (#352) */}
        {SUPABASE_ORIGIN && (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        )}
        {/* Warm Google Fonts so Fraunces + Noto Sans TC woff2 fetches don't
            wait for document parse. preconnect to fonts.googleapis.com (CSS
            host); dns-prefetch to fonts.gstatic.com (font binary host) since
            the actual binary URL isn't known until the CSS resolves. (#511) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      </head>
      <body className="antialiased">
        <InAppBrowserGuardLazy strings={t.inAppBrowser} />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
