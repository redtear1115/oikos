/**
 * PostHog only runs in production with a key configured. This keeps local dev
 * (and any environment missing the key) from initializing PostHog and sending
 * events to the real project — and avoids the "initialized without a token"
 * warning when the key isn't set. Build-time constant, so it's identical on the
 * server and client (no hydration mismatch from the conditional it gates).
 *
 * Lives in its own module rather than next to the provider on purpose (#1014):
 * `track.ts` needs this flag and `app/providers.tsx` needs `flushQueue()` from
 * `track.ts`. Exporting the flag from the provider makes those two modules
 * import each other, and a cycle in the analytics layer is the last place we
 * want one — this is the layer whose failures are silent by nature. A leaf
 * module with no imports of its own cannot participate in a cycle.
 */
export const POSTHOG_ENABLED =
  process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_POSTHOG_KEY
