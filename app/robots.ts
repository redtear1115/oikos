import type { MetadataRoute } from 'next'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://futari.southern-light.dev'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/sign-in', '/terms', '/privacy'],
        // Auth-walled and internal paths. Even though middleware 307s these to
        // /sign-in for unauthed crawlers, declaring them keeps signals clean.
        disallow: ['/dashboard', '/setup', '/invite/', '/auth/', '/api/'],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL,
  }
}
