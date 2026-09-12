import { describe, it, expect } from 'vitest'
import {
  entrySourceFromParam,
  importResumeSourceFromParam,
  appendQueryParam,
  buildAuthCallbackUrl,
  isFirstAuth,
  fromParamForUseCase,
} from '@/lib/analytics/attribution'
import { USE_CASE_SLUGS } from '@/lib/use-case/cases'
import { MIGRATE_SOURCES, type MigrateSlug } from '@/lib/migrate/sources'
import { KNOWN_CSV_SOURCES } from '@/lib/csvImport/detector'

const MIGRATE_SLUGS = Object.keys(MIGRATE_SOURCES) as MigrateSlug[]

describe('entrySourceFromParam', () => {
  it('maps landing', () => expect(entrySourceFromParam('landing')).toBe('landing'))
  it('maps migrate sources', () => {
    expect(entrySourceFromParam('honeydue')).toBe('migrate_honeydue')
    expect(entrySourceFromParam('spendee')).toBe('migrate_spendee')
    expect(entrySourceFromParam('cwmoney')).toBe('migrate_cwmoney')
  })
  it('underscores hyphenated slugs (#1062)', () => {
    expect(entrySourceFromParam('simple-daily-money')).toBe('migrate_simple_daily_money')
  })
  it('counts every registered migrate source, parser or not (#1062)', () => {
    // The analytics axis follows lib/migrate/sources.ts, not the importer list.
    // Adding a source to the registry must make it countable with no edit here;
    // when it silently fell back to `direct`, twelve of fifteen pages — the ones
    // carrying the traffic — were invisible in the funnel.
    for (const slug of MIGRATE_SLUGS) {
      expect(entrySourceFromParam(slug)).toBe(`migrate_${slug.replaceAll('-', '_')}`)
    }
    expect(MIGRATE_SLUGS.map((slug) => entrySourceFromParam(slug))).not.toContain('direct')
  })
  it('rejects an unregistered migrate slug rather than minting a value', () => {
    expect(entrySourceFromParam('not-a-competitor')).toBe('direct')
    // `in` would walk the prototype chain and turn this into `migrate_toString`.
    expect(entrySourceFromParam('toString')).toBe('direct')
    expect(entrySourceFromParam('constructor')).toBe('direct')
  })
  it('maps invite', () => expect(entrySourceFromParam('invite')).toBe('invite'))
  it('maps use-case pages per slug (#1056)', () => {
    expect(entrySourceFromParam('use-case-cohabitation')).toBe('use_case_cohabitation')
    expect(entrySourceFromParam('use-case-aa-split')).toBe('use_case_aa_split')
  })
  it('rejects an unregistered use-case slug rather than minting a value', () => {
    expect(entrySourceFromParam('use-case-not-a-page')).toBe('direct')
    expect(entrySourceFromParam('use-case-')).toBe('direct')
    // 'hub' is the one non-slug value that IS legal — guard the boundary so a
    // future rename can't quietly turn it back into `direct`.
    expect(entrySourceFromParam('use-case-hubs')).toBe('direct')
  })
  it('falls back to direct for null/unknown', () => {
    expect(entrySourceFromParam(null)).toBe('direct')
    expect(entrySourceFromParam(undefined)).toBe('direct')
    expect(entrySourceFromParam('garbage')).toBe('direct')
  })
})

describe('fromParamForUseCase', () => {
  it('prefixes the slug so it cannot collide with a migrate source', () => {
    expect(fromParamForUseCase('travel')).toBe('use-case-travel')
    // The /use-case index is not one of the ten scenarios. It carries its own
    // value rather than borrowing a slug's — main went red because the hub's
    // CTA had no source at all (#1061 + #1064 merged clean but didn't compile).
    expect(fromParamForUseCase('hub')).toBe('use-case-hub')
    expect(entrySourceFromParam('use-case-hub')).toBe('use_case_hub')
  })
  it('round-trips through entrySourceFromParam for every registered slug', () => {
    for (const slug of USE_CASE_SLUGS) {
      expect(entrySourceFromParam(fromParamForUseCase(slug))).toBe(
        `use_case_${slug.replaceAll('-', '_')}`,
      )
    }
  })
  it('does not leak into the importer axis', () => {
    expect(importResumeSourceFromParam(fromParamForUseCase('travel'))).toBeUndefined()
  })
})

describe('importResumeSourceFromParam', () => {
  it('returns the raw source for every source that has a CSV parser', () => {
    // Derived from lib/csvImport/detector.ts: shipping a new parser makes
    // import-resume follow with no edit in lib/analytics/attribution.ts.
    for (const source of KNOWN_CSV_SOURCES) {
      expect(importResumeSourceFromParam(source)).toBe(source)
    }
  })
  it('stays undefined for migrate pages with no parser (#1062)', () => {
    // Load-bearing, and the reason this test exists: widening this axis to the
    // whole registry throws nothing — it points post-auth onboarding at a source
    // with no mapper, and the import quietly never resumes. The analytics axis
    // still counts these pages; only import-resume must not claim them.
    const parserless = MIGRATE_SLUGS.filter(
      (slug) => !(KNOWN_CSV_SOURCES as readonly string[]).includes(slug),
    )
    expect(parserless.length).toBeGreaterThan(0)
    for (const slug of parserless) {
      expect(importResumeSourceFromParam(slug)).toBeUndefined()
      expect(entrySourceFromParam(slug)).not.toBe('direct')
    }
  })
  it('ignores non-migrate from values', () => {
    expect(importResumeSourceFromParam('landing')).toBeUndefined()
    expect(importResumeSourceFromParam('invite')).toBeUndefined()
    expect(importResumeSourceFromParam(null)).toBeUndefined()
    expect(importResumeSourceFromParam(undefined)).toBeUndefined()
  })
})

describe('appendQueryParam', () => {
  it('uses ? when no existing query', () => {
    expect(appendQueryParam('/sign-in', 'from', 'landing')).toBe('/sign-in?from=landing')
  })
  it('uses & when a query already exists', () => {
    expect(appendQueryParam('/sign-in?next=%2Fx', 'from', 'landing')).toBe('/sign-in?next=%2Fx&from=landing')
  })
  it('encodes the value', () => {
    expect(appendQueryParam('/x', 'from', 'a/b')).toBe('/x?from=a%2Fb')
  })
})

describe('buildAuthCallbackUrl', () => {
  it('always includes next', () => {
    expect(buildAuthCallbackUrl('https://app.test', { next: '/dashboard' }))
      .toBe('https://app.test/auth/callback?next=%2Fdashboard')
  })
  it('includes from and aid when present', () => {
    const url = buildAuthCallbackUrl('https://app.test', { next: '/dashboard', from: 'honeydue', anonId: 'anon-1' })
    expect(url).toBe('https://app.test/auth/callback?next=%2Fdashboard&from=honeydue&aid=anon-1')
  })
  it('omits from and aid when falsy', () => {
    const url = buildAuthCallbackUrl('https://app.test', { next: '/x', from: null, anonId: undefined })
    expect(url).toBe('https://app.test/auth/callback?next=%2Fx')
  })
})

describe('isFirstAuth', () => {
  it('true when created within the window', () => {
    const now = new Date('2026-05-24T00:02:00Z')
    expect(isFirstAuth(new Date('2026-05-24T00:01:00Z'), now)).toBe(true)
  })
  it('false when created long ago', () => {
    const now = new Date('2026-05-24T00:10:00Z')
    expect(isFirstAuth(new Date('2026-05-24T00:00:00Z'), now)).toBe(false)
  })
})
