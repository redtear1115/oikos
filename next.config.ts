import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

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
    ];
  },
};

export default withSerwist(nextConfig);
