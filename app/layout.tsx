import type { Metadata, Viewport } from 'next'
import { Fraunces, Noto_Sans_TC } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getLocale, getTranslations } from '@/lib/i18n/t'
import { InAppBrowserGuard } from '@/components/InAppBrowserGuard'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-fraunces',
  display: 'swap',
})

const notoTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-noto-tc',
  display: 'swap',
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

const SEO_TITLE = 'Futari · 兩個人的家計簿｜伴侶／夫妻共享記帳'
const SEO_DESCRIPTION =
  '專為伴侶、夫妻設計的雙人共享帳本。一起記錄日常開銷、自動分攤費用與 AA 制結算，掌握家庭預算、資產盤點、保險與愛車油耗紀錄。Mobile-first PWA 家計簿，台灣團隊製作。'
const OG_DESCRIPTION = '一起記錄、自動分攤、輕鬆結算。雙人共享的家庭記帳 PWA。'

export const metadata: Metadata = {
  // metadataBase resolves all relative metadata URLs (OG image, Twitter card, etc.)
  // against the canonical domain. Without it, Next.js logs warnings + falls back to
  // a guessed origin which is wrong on Vercel preview deployments.
  metadataBase: new URL(APP_URL),
  title: SEO_TITLE,
  description: SEO_DESCRIPTION,
  // Google ignores `keywords`, but Bing and 百度 still read it. Cheap to include.
  keywords: [
    '家庭記帳', '共享帳本', '雙人記帳', '家計簿',
    '伴侶理財', '夫妻記帳', '兩人生活費',
    '費用分攤', '分割帳單', 'AA 制', 'AA制',
    '家庭資產管理', '資產盤點', '保險管理',
    '汽車記帳', '油耗計算', '汽油記錄',
    '新婚理財', '家庭預算', '存錢',
    'Futari', 'ふたり',
  ],
  alternates: {
    canonical: '/',
    languages: {
      'zh-TW': '/',
      'zh-CN': '/?lang=zh-CN',
      en: '/?lang=en',
      ja: '/?lang=ja',
    },
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
  openGraph: {
    title: SEO_TITLE,
    description: OG_DESCRIPTION,
    url: '/',
    siteName: 'Futari',
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: 'Futari · 兩個人，一本帳' },
      { url: '/og-line.png', width: 1200, height: 600, alt: 'Futari · 兩個人，一本帳' },
      { url: '/og-square.png', width: 1200, height: 1200, alt: 'Futari · 兩個人，一本帳' },
    ],
    locale: 'zh_TW',
    alternateLocale: ['zh_CN', 'en_US', 'ja_JP'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_TITLE,
    description: OG_DESCRIPTION,
    images: ['/og-image.png'],
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
    <html lang={locale} className={`${fraunces.variable} ${notoTC.variable}`}>
      <body className="antialiased">
        <InAppBrowserGuard strings={t.inAppBrowser} />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
