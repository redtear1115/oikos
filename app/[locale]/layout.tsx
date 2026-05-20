import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { SUPPORTED_LOCALES, isLocale } from '@/lib/i18n/locales-meta'
import { dictionaries } from '@/lib/i18n/t'

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

  // Site-wide identity JSON-LD (#669 M-11). WebSite (sitelinks search box hint)
  // and Organization (brand identity) describe the whole site, so they render
  // once here for every public locale page rather than being duplicated per
  // page. name / alternateName follow the URL locale so each canonical URL's
  // schema language matches its rendered content.
  const t = dictionaries[locale]
  const webSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: t.landing.jsonLdAppName,
    alternateName: t.landing.jsonLdAlternateNames,
    url: APP_URL,
    inLanguage: ['zh-TW', 'zh-CN', 'en', 'ja'],
  }
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
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
      {children}
    </>
  )
}
