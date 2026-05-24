import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

// Serwist generates `public/sw.js` at build time. The runtime registration is
// gated by the user's Settings toggle; we don't auto-register here.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  register: false,
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  // Acknowledge Turbopack so `next dev` (Turbopack default) doesn't error on
  // the webpack hook injected by Serwist. The hook is a no-op in dev anyway
  // (Serwist's `disable: isDev`); production build forces webpack via
  // `next build --webpack` so the hook actually runs and emits public/sw.js.
  turbopack: {},
  reactStrictMode: true,
  // Default is true but explicit prevents future regression on framework changes.
  compress: true,
  // Default is true; flip off so responses don't leak `X-Powered-By: Next.js`.
  poweredByHeader: false,
  env: {
    // Exposed to sw.ts at build time so /offline can be precached with a
    // valid revision. VERCEL_GIT_COMMIT_SHA changes on every deploy; falls
    // back to 'dev' for local builds where the var isn't set.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev',
  },
  images: {
    // AVIF first, then WebP — Next.js negotiates via the request Accept header
    // and falls back to the original format for unsupported browsers.
    formats: ['image/avif', 'image/webp'],
    // Trimmed for our mobile-first PWA (~no desktop-retina target). Drops the
    // unused 2048 / 3840 buckets that Next.js ships by default.
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1440, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Whitelists Supabase Storage hosts so next/image can proxy avatar URLs
    // (Avatar.tsx still uses plain <img> today; this unlocks the migration
    // without a config follow-up). Project-domain and storage URLs both live
    // under *.supabase.co/storage/v1/object/... so one wildcard covers them.
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        // Service workers must never be served from CDN cache — the browser
        // needs a fresh byte-comparison on every load to detect updates and to
        // complete initial registration. Without this, Vercel returns 304 and
        // navigator.serviceWorker.register() silently fails.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        // SVG favicon never changes in practice; serve immutable for a year.
        source: "/favicon.svg",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // PWA icons are part of the manifest; only ever change when we rev
        // filenames. Safe to cache immutably for a year.
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // OG images change occasionally (rendered by scripts/og/); a week of
        // CDN caching is enough — most social crawlers re-fetch on share anyway.
        // Enumerated because path-to-regexp can't repeat a param without
        // a prefix segment (i.e. `/og-:path*` errors at build time).
        source: "/:file(og-image|og-image-2x|og-line|og-square).png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default withSentryConfig(withSerwist(nextConfig), {
  org: "southern-light-dev",
  // Project slug from the Next.js onboarding. If source-map upload 404s at
  // build time, confirm the exact slug in Sentry → Settings → Projects.
  project: "javascript-nextjs",
  // Suppress Sentry build logs.
  silent: true,
  // Upload a wider set of client bundles so stack traces resolve cleanly.
  widenClientFileUpload: true,
  // NOTE: `hideSourceMaps` was removed in @sentry/nextjs v8+. Source maps are
  // deleted after upload by default (sourcemaps.deleteSourcemapsAfterUpload),
  // so they are never served publicly — no explicit option needed.
  webpack: {
    // Don't auto-create Vercel cron monitors.
    automaticVercelMonitors: false,
    // Tree-shake the Sentry SDK's internal logger statements (was `disableLogger`).
    treeshake: { removeDebugLogging: true },
  },
});
