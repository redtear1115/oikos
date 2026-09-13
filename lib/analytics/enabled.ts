import { IS_PROD_DEPLOY } from '@/lib/deployEnv'

/**
 * PostHog only runs on the production deployment with a key configured. This
 * keeps local dev (and any environment missing the key) from initializing
 * PostHog and sending events to the real project — and avoids the "initialized
 * without a token" warning when the key isn't set. Build-time constant, so it's
 * identical on the server and client (no hydration mismatch from the
 * conditional it gates).
 *
 * The gate used to be `NODE_ENV === 'production'`, which also matched a local
 * `next build && next start` and every Vercel preview deployment — see
 * `lib/deployEnv.ts` for what that looked like in the data (#1116).
 *
 * Lives in its own module rather than next to the provider on purpose (#1014):
 * `track.ts` needs this flag and `app/providers.tsx` needs `flushQueue()` from
 * `track.ts`. Exporting the flag from the provider makes those two modules
 * import each other, and a cycle in the analytics layer is the last place we
 * want one — this is the layer whose failures are silent by nature. The one
 * import here is `deployEnv`, which is itself a leaf with no imports, so the
 * no-cycle property this module was split out for still holds.
 */
export const POSTHOG_ENABLED = IS_PROD_DEPLOY && !!process.env.NEXT_PUBLIC_POSTHOG_KEY
