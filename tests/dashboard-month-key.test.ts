import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { currentYearMonthInTaipei, formatYearMonth } from '@/lib/monthlyReview'

/**
 * #1130 — the dashboard's month key must be the *Taipei* month.
 *
 * The rows are bucketed with `AT TIME ZONE 'Asia/Taipei'`
 * (lib/db/queries/_predicates.ts) while Vercel runs the server in UTC, so a key
 * built from a raw `new Date()`'s local fields named the previous month between
 * 00:00 and 08:00 Taipei on the 1st of each month. Both heroes — income and the
 * solo expense hero (#1118) — read that one variable, for their query *and*
 * their label.
 *
 * The failure is quiet rather than contradictory: label and data agree, because
 * both come from the same wrong key. Nothing looks broken; the user just spends
 * the morning of the 1st looking at last month. It also repairs itself by
 * lunchtime, which is why it went unnoticed.
 *
 * These tests are timezone-independent on purpose. Pinning `process.env.TZ`
 * mid-run is unreliable, and this machine sits in Asia/Taipei anyway — where
 * the bug cannot reproduce at all. So the UTC reading is asserted explicitly
 * with `getUTC*` instead of being simulated.
 */

/** 2026-09-01 03:00 in Taipei is 2026-08-31 19:00 UTC — inside the bad window. */
const FIRST_OF_MONTH_EARLY_TAIPEI = new Date('2026-08-31T19:00:00.000Z')

describe('dashboard month key (#1130)', () => {
  it('names the Taipei month during the 00:00–08:00 window on the 1st', () => {
    expect(formatYearMonth(currentYearMonthInTaipei(FIRST_OF_MONTH_EARLY_TAIPEI))).toBe('2026-09')
  })

  it('is the month a UTC server would have got wrong', () => {
    // What the old expression produced on Vercel: server-local (= UTC) fields.
    const utcKey = `${FIRST_OF_MONTH_EARLY_TAIPEI.getUTCFullYear()}-${String(
      FIRST_OF_MONTH_EARLY_TAIPEI.getUTCMonth() + 1,
    ).padStart(2, '0')}`
    expect(utcKey).toBe('2026-08')
    // ...which is precisely the month this fix must not return.
    expect(formatYearMonth(currentYearMonthInTaipei(FIRST_OF_MONTH_EARLY_TAIPEI))).not.toBe(utcKey)
  })

  it('still agrees with the server clock away from the boundary', () => {
    const midMonth = new Date('2026-09-15T12:00:00.000Z')
    expect(formatYearMonth(currentYearMonthInTaipei(midMonth))).toBe('2026-09')
  })

  it('carries the year across the December boundary', () => {
    // 2027-01-01 02:00 Taipei = 2026-12-31 18:00 UTC.
    const newYear = new Date('2026-12-31T18:00:00.000Z')
    expect(formatYearMonth(currentYearMonthInTaipei(newYear))).toBe('2027-01')
  })
})

/**
 * The unit tests above prove the helper is right; this one proves the page
 * actually uses it. Without it the helper could be correct while the page kept
 * its own `new Date()` — which is exactly the state this issue found. Same
 * file-level-comparison shape as tests/reduced-motion.test.ts.
 */
describe('dashboard page wiring (#1130)', () => {
  const raw = readFileSync(
    join(process.cwd(), 'app/(dashboard)/dashboard/page.tsx'),
    'utf8',
  )
  // Comments are stripped first — the assertions below are about code, and the
  // fix's own comment names `new Date()` while explaining why it was removed.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('derives the month key from the Taipei helper', () => {
    expect(source).toMatch(/const yyyymm = formatYearMonth\(todayYM\)/)
  })

  it('does not rebuild a month key from server-local Date fields', () => {
    expect(source).not.toMatch(/getMonth\(\)/)
    expect(source).not.toMatch(/new Date\(\)/)
  })
})
