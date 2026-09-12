import { describe, it, expect } from 'vitest'
import {
  entrySourceFromParam,
  migrateSourceFromParam,
  appendQueryParam,
  buildAuthCallbackUrl,
  isFirstAuth,
  fromParamForUseCase,
} from '@/lib/analytics/attribution'
import { USE_CASE_SLUGS } from '@/lib/use-case/cases'

describe('entrySourceFromParam', () => {
  it('maps landing', () => expect(entrySourceFromParam('landing')).toBe('landing'))
  it('maps migrate sources', () => {
    expect(entrySourceFromParam('honeydue')).toBe('migrate_honeydue')
    expect(entrySourceFromParam('spendee')).toBe('migrate_spendee')
    expect(entrySourceFromParam('cwmoney')).toBe('migrate_cwmoney')
  })
  it('maps invite', () => expect(entrySourceFromParam('invite')).toBe('invite'))
  it('maps use-case pages per slug (#1056)', () => {
    expect(entrySourceFromParam('use-case-cohabitation')).toBe('use_case_cohabitation')
    expect(entrySourceFromParam('use-case-aa-split')).toBe('use_case_aa_split')
  })
  it('rejects an unregistered use-case slug rather than minting a value', () => {
    expect(entrySourceFromParam('use-case-not-a-page')).toBe('direct')
    expect(entrySourceFromParam('use-case-')).toBe('direct')
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
  })
  it('round-trips through entrySourceFromParam for every registered slug', () => {
    for (const slug of USE_CASE_SLUGS) {
      expect(entrySourceFromParam(fromParamForUseCase(slug))).toBe(
        `use_case_${slug.replaceAll('-', '_')}`,
      )
    }
  })
  it('does not leak into the importer axis', () => {
    expect(migrateSourceFromParam(fromParamForUseCase('travel'))).toBeUndefined()
  })
})

describe('migrateSourceFromParam', () => {
  it('returns the raw source only for known migrate sources', () => {
    expect(migrateSourceFromParam('honeydue')).toBe('honeydue')
    expect(migrateSourceFromParam('landing')).toBeUndefined()
    expect(migrateSourceFromParam(null)).toBeUndefined()
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
