/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import {
  Serwist,
  NetworkFirst,
  CacheFirst,
  ExpirationPlugin,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const STATIC_CACHE = 'static-v1'
const DYNAMIC_CACHE = 'dynamic-v1'

// Cache only successful, non-redirected, authenticated responses. Next.js
// `redirect()` from a server component or middleware lands here as a followed
// 3xx → response.redirected = true; this keeps a /sign-in body from being
// stored under /dashboard.
const onlyCacheSuccessfulHtml = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (
      response.status === 200 &&
      !response.redirected &&
      !response.url.includes('/sign-in') &&
      !response.url.includes('/setup') &&
      !response.url.includes('/onboarding')
    ) {
      return response
    }
    return null
  },
}

const serwist = new Serwist({
  precacheEntries: [
    ...((self.__SW_MANIFEST ?? []) as (PrecacheEntry | string)[]),
    '/offline',
    '/manifest.json',
    '/favicon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-192-maskable.png',
    '/icons/icon-512-maskable.png',
    '/icons/apple-touch-icon.png',
    '/og-image.png',
    '/og-image-2x.png',
  ],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
  runtimeCaching: [
    // Dynamic HTML for the read-only browse paths. NetworkFirst with a 3s
    // timeout keeps fresh data ahead of cache hits, then falls back to cache
    // when offline / slow.
    {
      matcher: ({ url, sameOrigin }) => {
        if (!sameOrigin) return false
        const p = url.pathname
        return (
          p === '/dashboard' ||
          p === '/records' ||
          p === '/assets' ||
          p.startsWith('/assets/')
        )
      },
      handler: new NetworkFirst({
        cacheName: DYNAMIC_CACHE,
        networkTimeoutSeconds: 3,
        plugins: [
          onlyCacheSuccessfulHtml,
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24 * 7,
          }),
        ],
      }),
    },
    // Same-origin static assets we didn't already precache (icons, og images).
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith('/icons/') ||
          url.pathname.startsWith('/og-image')),
      handler: new CacheFirst({
        cacheName: STATIC_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
  ],
})

serwist.addEventListeners()
