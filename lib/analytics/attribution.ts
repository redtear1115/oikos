// Pure attribution helpers shared by client + server. No side effects, no SDK
// imports — safe to import from anywhere. See conversion-analytics-design.md.

export type EntrySource =
  | 'landing'
  | 'migrate_honeydue'
  | 'migrate_spendee'
  | 'migrate_cwmoney'
  | 'direct'

export type MigrateFromSource = 'honeydue' | 'spendee' | 'cwmoney'

/** Derive the analytics entry-source axis from the `from` query param. */
export function entrySourceFromParam(from: string | null | undefined): EntrySource {
  switch (from) {
    case 'landing':
      return 'landing'
    case 'honeydue':
      return 'migrate_honeydue'
    case 'spendee':
      return 'migrate_spendee'
    case 'cwmoney':
      return 'migrate_cwmoney'
    default:
      return 'direct'
  }
}

/** Raw migrate source when `from` is a known importer source, else undefined. */
export function migrateSourceFromParam(
  from: string | null | undefined,
): MigrateFromSource | undefined {
  return from === 'honeydue' || from === 'spendee' || from === 'cwmoney' ? from : undefined
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
