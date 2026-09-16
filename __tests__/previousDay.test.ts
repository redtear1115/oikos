import { describe, it, expect } from 'vitest'
import { previousDay } from '@/lib/local-date'

/**
 * #1244 — `createRule` snaps relative to the day before today, so this helper
 * decides whether a rule's first period is today or next month. An off-by-one
 * here is silent: the rule saves, the list shows a plausible date, and only
 * the missing (or surplus) pending card a night later says anything.
 *
 * The rollovers are the part worth pinning; the timezone case below is the
 * reason the helper exists at all.
 */
describe('previousDay', () => {
  it('steps back inside a month', () => {
    expect(previousDay('2026-05-07')).toBe('2026-05-06')
  })

  it('rolls back over a month boundary', () => {
    expect(previousDay('2026-05-01')).toBe('2026-04-30')
  })

  it('rolls back over a year boundary', () => {
    expect(previousDay('2026-01-01')).toBe('2025-12-31')
  })

  it('knows 2024 was a leap year', () => {
    expect(previousDay('2024-03-01')).toBe('2024-02-29')
  })

  it('knows 2026 is not', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
  })

  it('gives the same answer in every timezone the app can run in', () => {
    // The failure this guards is the one #1130 / #1262 were: a naive
    // `new Date(ymd)` parses as UTC midnight, and any local-time read after
    // that lands a day early west of UTC. Pinning to UTC noon leaves 12 hours
    // of slack either way, so the answer cannot depend on where the server is.
    const original = process.env.TZ
    try {
      for (const tz of ['UTC', 'Asia/Taipei', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Etc/GMT+12']) {
        process.env.TZ = tz
        expect(previousDay('2026-05-01'), `TZ=${tz}`).toBe('2026-04-30')
        expect(previousDay('2026-01-01'), `TZ=${tz}`).toBe('2025-12-31')
      }
    } finally {
      process.env.TZ = original
    }
  })
})
