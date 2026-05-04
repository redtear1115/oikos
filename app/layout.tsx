import type { Metadata, Viewport } from 'next'
import { Fraunces, Noto_Sans_TC } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fraunces',
  display: 'swap',
})

const notoTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-tc',
  display: 'swap',
})

export const metadata: Metadata = {
  // metadataBase resolves all relative metadata URLs (OG image, Twitter card, etc.)
  // against the canonical domain. Without it, Next.js logs warnings + falls back to
  // a guessed origin which is wrong on Vercel preview deployments.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'),
  title: 'Futari',
  description: 'ふたり ・ 家計簿 — 兩個人的記帳本',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Futari',
  },
}

export const viewport: Viewport = {
  themeColor: '#FBEDE0',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale: WCAG 1.4.4 (Resize Text) requires letting users zoom.
  // Inputs are sized at >= 16px to avoid iOS auto-zoom on focus.
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${fraunces.variable} ${notoTC.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
