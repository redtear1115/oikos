// Pure attribution helpers shared by client + server. No side effects, no SDK
// imports — safe to import from anywhere. See conversion-analytics-design.md.

import { KNOWN_CSV_SOURCES, type KnownCsvSource } from '@/lib/csvImport/detector'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'
import { USE_CASE_SLUGS, type UseCaseSlug } from '@/lib/use-case/cases'

/*
 * Two different axes read the same `from` query param. They are NOT the same
 * list and must never be merged (#1062):
 *
 *   analytics    — `entrySourceFromParam`, authority `lib/migrate/sources.ts`.
 *                  Every /migrate page that exists should be countable.
 *   import-resume — `importResumeSourceFromParam`, authority
 *                  `lib/csvImport/detector.ts`. Only sources we can actually
 *                  parse may resume an import after sign-in.
 */

/** `aa-split` → `aa_split`, so slugs survive into snake_case event values. */
type Underscored<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Head}_${Underscored<Tail>}`
  : S

/**
 * One `entry_source` per use-case page rather than a single collapsed
 * `use_case` (#1056). The ten `/use-case/<slug>` pages exist precisely to test
 * which situation pulls; collapsing them would erase the only axis they were
 * built to measure, and PostHog breakdowns cost nothing extra per value.
 */
/**
 * `hub` is the `/use-case` index, not one of the ten scenarios. It gets its own
 * value rather than borrowing a slug's: a click there says "browsing the
 * situations", which is a different intent from "this situation is mine".
 */
export type UseCaseCtaSource = UseCaseSlug | 'hub'

export type UseCaseEntrySource =
  | `use_case_${Underscored<UseCaseSlug>}`
  | 'use_case_hub'

/**
 * ANALYTICS AXIS — one value per `/migrate/<slug>` page, derived from the
 * registry so a new competitor page is countable the day it ships. Before
 * #1062 this union listed only the three sources that happen to have a CSV
 * parser, and the other twelve pages — the ones carrying most of the traffic —
 * were silently counted as `direct`.
 */
export type MigrateEntrySource = `migrate_${Underscored<MigrateSlug>}`

export type EntrySource =
  | 'landing'
  | MigrateEntrySource
  | UseCaseEntrySource
  | 'invite'
  | 'direct'

/**
 * IMPORT-RESUME AXIS — not analytics. Narrower on purpose: only a source whose
 * CSV we can parse may resume an import after sign-in. Widening this to the
 * whole migrate registry throws no error; it just points the post-auth
 * onboarding at a source with no mapper, which fails silently later. Guarded by
 * a test in `tests/analytics-attribution.test.ts` for exactly that reason.
 */
export type ImportResumeSource = KnownCsvSource

/** Prefix marking a `from` value as a use-case page, kept off migrate slugs. */
const USE_CASE_FROM_PREFIX = 'use-case-'

/**
 * The `from` query value a `/use-case/<slug>` CTA tags its sign-in link with.
 * Single source of truth so the emitter and `entrySourceFromParam` cannot drift
 * — a mismatch there is silent, it just reads back as `direct`.
 *
 * Named `fromParamFor…`, not `useCase…`: a `use` prefix makes
 * `react-hooks/rules-of-hooks` treat every call site as a hook call and fail lint.
 */
export function fromParamForUseCase(source: UseCaseCtaSource): string {
  return `${USE_CASE_FROM_PREFIX}${source}`
}

/** `use-case-aa-split` → `use_case_aa_split`; unknown slugs → undefined. */
function entrySourceForUseCase(from: string): UseCaseEntrySource | undefined {
  if (!from.startsWith(USE_CASE_FROM_PREFIX)) return undefined
  const source = from.slice(USE_CASE_FROM_PREFIX.length)
  if (source === 'hub') return 'use_case_hub'
  if (!USE_CASE_SLUGS.includes(source as UseCaseSlug)) return undefined
  return `use_case_${source.replaceAll('-', '_')}` as UseCaseEntrySource
}

/**
 * Which client flow produced an auth success — the axis `signed_in` / `signed_up`
 * were missing, which is why every conversion looked alike in PostHog (#998).
 * Named after `sign_in_failed`'s existing `path` property so success and failure
 * can be sliced the same way.
 *
 * - `web_oauth` — everything that lands on /auth/callback. That is browser web
 *   *and* Android's in-app-browser OAuth: `buildAuthCallbackUrl` carries no
 *   platform hint, so the callback genuinely cannot tell the two apart.
 * - `ios_native` — Apple's native sheet via `signInWithIdToken`, which skips the
 *   callback entirely and reports through `recordNativeAuthConversion`.
 */
export type AuthPath = 'web_oauth' | 'ios_native'

/**
 * Migrate CTAs tag sign-in with the bare slug (`?from=cwmoney`), so membership
 * of the registry is the whole test. `Object.keys` rather than `in`: `in` walks
 * the prototype chain, which would let `?from=toString` mint a breakdown value.
 */
const MIGRATE_SLUGS = new Set<string>(Object.keys(MIGRATE_SOURCES))

/** `simple-daily-money` → `migrate_simple_daily_money`; unknown slugs → undefined. */
function entrySourceForMigrate(from: string): MigrateEntrySource | undefined {
  if (!MIGRATE_SLUGS.has(from)) return undefined
  return `migrate_${from.replaceAll('-', '_')}` as MigrateEntrySource
}

/** Derive the analytics entry-source axis from the `from` query param. */
export function entrySourceFromParam(from: string | null | undefined): EntrySource {
  if (from === 'landing') return 'landing'
  if (from === 'invite') return 'invite'
  const value = from ?? ''
  return entrySourceForMigrate(value) ?? entrySourceForUseCase(value) ?? 'direct'
}

/**
 * The source whose import the post-auth onboarding should resume, or undefined.
 * Reads the same `from` param as `entrySourceFromParam` but answers a different
 * question — see the two-axis note at the top of this file. Only sources with a
 * dedicated CSV parser qualify; everything else (including the twelve
 * parser-less /migrate pages) is `undefined` here while still being counted by
 * the analytics axis.
 */
export function importResumeSourceFromParam(
  from: string | null | undefined,
): ImportResumeSource | undefined {
  return KNOWN_CSV_SOURCES.find((source) => source === from)
}

/** Append an encoded key=value to a relative or absolute href. */
export function appendQueryParam(href: string, key: string, value: string): string {
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

/**
 * Build the OAuth callback URL carrying funnel attribution across the redirect.
 * `aid` is the client's anonymous PostHog distinct_id so the callback can
 * alias() the pre-auth events onto the real user.
 */
export function buildAuthCallbackUrl(
  origin: string,
  opts: { next: string; from?: string | null; anonId?: string | null },
): string {
  const params = new URLSearchParams()
  params.set('next', opts.next)
  if (opts.from) params.set('from', opts.from)
  if (opts.anonId) params.set('aid', opts.anonId)
  return `${origin}/auth/callback?${params.toString()}`
}

/**
 * Treat an auth success as a first-time sign-up when the auth user was created
 * within `windowMs` of now. memory-persistence means we can't read a prior
 * client flag; the user's created_at is the reliable first-auth signal.
 */
export function isFirstAuth(userCreatedAt: Date, now: Date, windowMs = 120_000): boolean {
  return now.getTime() - userCreatedAt.getTime() <= windowMs
}
