import type { MetadataRoute } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

// Locale variants are signaled via ?lang=xx (cookie-backed); see middleware.ts.
function withLocaleAlternates(path: string) {
  return {
    'zh-TW': `${APP_URL}${path}`,
    'zh-CN': `${APP_URL}${path}?lang=zh-CN`,
    en: `${APP_URL}${path}?lang=en`,
    ja: `${APP_URL}${path}?lang=ja`,
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    {
      url: `${APP_URL}/sign-in`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1.0,
      alternates: { languages: withLocaleAlternates('/sign-in') },
    },
    {
      url: `${APP_URL}/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${APP_URL}/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]
}
