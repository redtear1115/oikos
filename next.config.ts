import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { PROTECTED_ROOT_SEGMENTS } from "./lib/auth/protectedPaths";

const isDev = process.env.NODE_ENV === "development";

// Bundle analyzer — outermost wrapper so the report covers everything
// Sentry's webpack plugin and Serwist inject. Gated by ANALYZE=true so it's a
// no-op in normal builds. Run with `npm run analyze` to open the HTML report.
const analyzer = withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// Serwist generates `public/sw.js` at build time. The runtime registration is
// gated by the user's Settings toggle; we don't auto-register here.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  register: false,
  reloadOnOnline: false,
});

// #1535 — signed-in surfaces refuse to be framed (clickjacking defence in
// depth; SameSite=Lax already keeps cross-site frames signed out). Roots are
// derived from PROTECTED_ROOT_SEGMENTS so a new dashboard page is covered the
// moment the #1275 drift guard forces it into that list; `api` and `invite`
// are listed here because they are signed-in but not page roots there
// (`/invite/[token]` is a one-click accept button). `:path*` matches zero
// segments too, so `/dashboard` and `/dashboard/a/b` are both covered.
//
// Only `frame-ancestors` — no default-src/frame-src — so Ko-fi, PostHog and
// Sentry are untouched. Public brand pages, /sign-in, /auth/callback and
// /offline are deliberately NOT matched.
//
// Set in next.config `headers()` like the Cache-Control rules above (proxy.ts
// notes that Cache-Control set there was overridden by dynamic rendering,
// #314; that note is about Cache-Control only). If a CSP is ever added from
// proxy.ts, vercel.json or anywhere else, it MUST carry `frame-ancestors
// 'none'` for these paths too: a response that ends up with a single CSP
// header lacking the directive is frameable again. Failure looks like
// nothing — pages render normally — and tests/frame-ancestors-1535.test.ts
// only checks this config, so check `curl -sI` on a deploy.
export const FRAME_DENY_ROOTS = [...PROTECTED_ROOT_SEGMENTS, "api", "invite"] as const;

export const FRAME_DENY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

// Exported unwrapped (no Sentry/Serwist/analyzer) so tests can match paths
// with Next's own matcher.
export const headerRules = [
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
    // Self-hosted woff2 (#978). next/font used to emit these under
    // /_next/static/media/, which Next serves immutable for us; serving them
    // from public/ means we have to say so ourselves, or every repeat visit
    // revalidates 105 font chunks. Filenames come from Google and change
    // whenever the font revision does, so a regeneration ships new names
    // rather than new bytes under an old name.
    source: "/fonts/:path*",
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
  {
    source: `/:root(${FRAME_DENY_ROOTS.join("|")})/:path*`,
    headers: FRAME_DENY_HEADERS,
  },
];

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
    // #1116 — which deployment this build belongs to, for the Sentry /
    // PostHog gates. Injected here rather than read from Vercel's mirrored
    // NEXT_PUBLIC_VERCEL_ENV so the client value can't vanish if the
    // "expose System Environment Variables" project setting is ever turned
    // off. Falls back to 'local' for any build off Vercel. See lib/deployEnv.ts
    // for why NODE_ENV was the wrong question.
    NEXT_PUBLIC_DEPLOY_ENV: process.env.VERCEL_ENV ?? 'local',
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
      // Google OAuth profile photos (lh3.googleusercontent.com/...).
      // Without this, next/image returns 400 and the avatar falls back to initials.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return headerRules;
  },
};

export default analyzer(withSentryConfig(withSerwist(nextConfig), {
  org: "southern-light-dev",
  project: "prj-futari",
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
}));
