import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { isLocale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'
import { TranslationsProvider } from '@/lib/i18n/client'
import { ogLocale, alternateOgLocales, ogImage } from '@/lib/i18n/seo'

// 出遊分享頁（#1558）：/<locale>/outing/<shareToken> 與 /<locale>/outing/r/<outingId>。
//
// Metadata is deliberately generic, like /invite/[token]: no outing name, no
// participant names. Chat-app link previewers fetch and cache this the moment
// the link is pasted, so it must look the same for every outing.
// `referrer: no-referrer` is the second layer behind the Referrer-Policy header
// (next.config.ts › OUTING_PUBLIC_HEADERS): the share token is in the URL, and
// a full-page navigation to /sign-in must not hand it to GA via
// document.referrer.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const c = dictionaries[locale].outingPublic
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    referrer: 'no-referrer',
    robots: { index: false, follow: false },
    openGraph: {
      title: c.metaTitle,
      description: c.metaDescription,
      siteName: 'Futari · 雙人記帳',
      type: 'website',
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images: [{ url: ogImage(locale), width: 1200, height: 630, alt: c.metaTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: c.metaTitle,
      description: c.metaDescription,
      images: [ogImage(locale)],
    },
  }
}

export default async function OutingPublicLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  // Client components here (and the reused dashboard sheets) read copy through
  // useTranslations(); the dashboard layout that normally provides it is not
  // above this route.
  return (
    <TranslationsProvider value={dictionaries[locale]} locale={locale}>
      <main className="relative max-w-md mx-auto min-h-dvh bg-bg">{children}</main>
    </TranslationsProvider>
  )
}
