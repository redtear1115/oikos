import type { MetadataRoute } from 'next'
import { SUPPORTED_LOCALES } from '@/lib/i18n/locales-meta'
import { localizedHref } from '@/lib/i18n/path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

const PUBLIC_PATHS = ['/', '/sign-in', '/terms', '/privacy']

export default function robots(): MetadataRoute.Robots {
  const allow = Array.from(
    new Set(
      PUBLIC_PATHS.flatMap((path) =>
        SUPPORTED_LOCALES.map((locale) => localizedHref(path, locale))
      )
    )
  )
  return {
    rules: [
      {
        userAgent: '*',
        allow,
        // Auth-walled and internal paths. Even though middleware 307s these to
        // /sign-in for unauthed crawlers, declaring them keeps signals clean.
        disallow: ['/dashboard', '/setup', '/onboarding', '/invite/', '/auth/', '/api/', '/offline'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
