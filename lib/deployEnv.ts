/**
 * #1116 — which deployment is this, as opposed to which build mode.
 *
 * Sentry and PostHog both used to gate on `NODE_ENV === 'production'`, which
 * answers a different question than the one they were asking. `NODE_ENV` is
 * `'production'` for *any* non-dev build: a local `next build && next start`,
 * a Vercel preview deployment, and an Android emulator pointed at a local
 * server all set it. So all three reported themselves as the production
 * environment and sent their data into the production projects.
 *
 * ## What that looked like when it was broken
 *
 * Nothing errored, and no number contradicted another. The two symptoms were:
 *
 * - A Sentry issue with a **High priority badge and 0 affected users** that
 *   could never be reproduced on prod — `PRJ-FUTARI-K`, 84 events, every
 *   single one from `localhost:3117` / `localhost:3118` / `10.0.2.2:3000`.
 *   It was `_vercel/speed-insights/script.js` 404-ing to an HTML page off
 *   Vercel, which cannot happen on the real deployment.
 * - PostHog anonymous visitor counts quietly inflated. Persistence is
 *   `'memory'` (cookieless), so every local page load mints a *new* person:
 *   65 events of local traffic produced ~45 phantom people, ~9% of all
 *   persons in a 30-day window. `observability-design.md` already warns that
 *   anonymous absolute counts are unusable and only same-kind relative
 *   comparisons hold — this skewed even those, because the pages someone
 *   opens locally are the pages being worked on, not a random sample.
 *
 * Both are only visible by going and looking at the `url` / `$host` tag. If
 * you are reading this because a number looks odd and you cannot find the
 * source: check the host distribution first.
 *
 * ## Why `VERCEL_ENV` and not a runtime host check
 *
 * Which deployment this is, is a property of the *build*, so it can be
 * resolved once at build time and inlined. That is deliberately unlike
 * `lib/platform.ts`, where the platform genuinely can only be known at
 * runtime because all three surfaces share one production deployment. Do not
 * import that conclusion into this file: `VERCEL_ENV` correctly reports
 * `'production'` for the web, the iOS shell and the Android shell alike,
 * because they are all loading the same production deployment.
 *
 * `NEXT_PUBLIC_DEPLOY_ENV` is injected in `next.config.ts` from `VERCEL_ENV`
 * rather than read from Vercel's own `NEXT_PUBLIC_VERCEL_ENV`. The mirrored
 * `NEXT_PUBLIC_*` system variables depend on a per-project Vercel setting
 * staying enabled; `VERCEL_ENV` itself does not. Injecting it ourselves means
 * the client value cannot silently disappear because someone toggled a
 * dashboard checkbox — and the failure mode if it did would be *total silent
 * loss of client analytics*, which is exactly the shape of #973. The same
 * `env` block already does this for `NEXT_PUBLIC_BUILD_ID`.
 */

/** Where this build is deployed. `'local'` covers every non-Vercel build. */
export type DeployEnv = 'production' | 'preview' | 'local'

function resolve(): DeployEnv {
  // Injected by next.config.ts from VERCEL_ENV; inlined at build time, so it
  // reads identically on the client, the server and the edge runtime.
  const value = process.env.NEXT_PUBLIC_DEPLOY_ENV
  if (value === 'production' || value === 'preview') return value
  // Anything else — unset, 'development', a typo — is not the production
  // deployment. Defaulting the unknown case to 'local' is the safe direction:
  // the cost is losing data we never had, whereas defaulting to 'production'
  // is how the pollution above happened in the first place.
  return 'local'
}

export const DEPLOY_ENV: DeployEnv = resolve()

/**
 * The single gate for "may this send telemetry to the production project".
 *
 * Preview deployments are excluded on purpose. They are legitimate builds, but
 * they are also the noisiest (one per push), and the Sentry free-tier quota is
 * the constraint the original `enabled` flag existed to protect. If preview
 * errors are ever wanted, give them their own Sentry environment rather than
 * folding them back in here — `DEPLOY_ENV` already distinguishes them.
 */
export const IS_PROD_DEPLOY = DEPLOY_ENV === 'production'
