/**
 * #1262 — the recurring generators and the push that announces them all read
 * the date in UTC, while they fire at 16:00 / 16:10 UTC — which is 00:00 /
 * 00:10 of the *next* Asia/Taipei day. Every card therefore landed one Taipei
 * day after its period (prod: lag_days = 1 for 21 of 21 recent pendings).
 *
 * Nothing here talks to Postgres, so the cron half is asserted the way
 * `recurring-expense-split-ratio.test.ts` does it: parse the job body out of
 * the migration that is actually live (cron.schedule() replaces by jobname, so
 * the highest-numbered migration owning the name wins) and assert on that. A
 * future migration that re-schedules either job from an older copy — the exact
 * way #1243 was almost reintroduced — fails here.
 *
 * The push half is a real unit test: the date computation was extracted into
 * `taipeiDate.ts` precisely so it could be run, since the Deno entrypoint
 * around it cannot be.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { taipeiDateISO } from '../supabase/functions/send-recurring-push/taipeiDate.ts'

const DRIZZLE_DIR = join(process.cwd(), 'drizzle')
const PUSH_FN = join(
  process.cwd(),
  'supabase/functions/send-recurring-push/index.ts',
)

const TAIPEI_DATE_SQL = "(NOW() AT TIME ZONE 'Asia/Taipei')::date"
const JOB_NAMES = ['generate-pending-income', 'generate-pending-expense'] as const

/** The schedule + body of the migration that currently owns `jobName`. */
function liveCronJob(jobName: string): { schedule: string; body: string } {
  const files = readdirSync(DRIZZLE_DIR).filter((f) => f.endsWith('.sql')).sort()
  const owning = files.filter((f) =>
    readFileSync(join(DRIZZLE_DIR, f), 'utf8').includes(`cron.schedule('${jobName}'`),
  )
  expect(owning.length, `no migration schedules ${jobName}`).toBeGreaterThan(0)
  const sql = readFileSync(join(DRIZZLE_DIR, owning[owning.length - 1]), 'utf8')
  const m = sql.match(
    new RegExp(`cron\\.schedule\\('${jobName}',\\s*'([^']+)',\\s*\\$\\$([\\s\\S]*?)\\$\\$\\)`),
  )
  expect(m, `cron.schedule('${jobName}', ...) body should be parseable`).not.toBeNull()
  return { schedule: m![1], body: m![2] }
}

describe.each(JOB_NAMES)('%s cron', (jobName) => {
  it('reads the date in Asia/Taipei, never bare CURRENT_DATE', () => {
    const { body } = liveCronJob(jobName)
    expect(body).not.toMatch(/CURRENT_DATE/)
    expect(body).toContain(TAIPEI_DATE_SQL)
  })

  it('applies the same basis to the INSERT and to the next_occurrence_at advance', () => {
    // The two predicates must move together. One without the other is silent:
    // advancing without inserting skips a period, inserting without advancing
    // retries the same period nightly behind ON CONFLICT DO NOTHING.
    const { body } = liveCronJob(jobName)
    const occurrences = body.split(TAIPEI_DATE_SQL).length - 1
    expect(occurrences).toBe(2)
    expect(body).toMatch(
      /next_occurrence_at\s*=\s*compute_next_occurrence\(next_occurrence_at, interval_months, day_of_month\)/,
    )
  })

  it('keeps the 16:00 UTC schedule', () => {
    // Deliberately unchanged by #1262: 00:00 Taipei was always the intended
    // firing time, only the in-body date basis was wrong. Moving the schedule
    // as well would make the first prod run un-attributable.
    expect(liveCronJob(jobName).schedule).toBe('0 16 * * *')
  })
})

describe('the firing instant vs. the Taipei day it belongs to', () => {
  it('maps 16:00 UTC to the Taipei day that has just begun', () => {
    // Why the fix is a whole-day shift rather than a rounding tweak: at the
    // scheduled instant, UTC still reads the previous calendar day while
    // Taipei has already rolled over.
    const firing = new Date('2026-09-16T16:00:00Z')
    expect(firing.toISOString().slice(0, 10)).toBe('2026-09-16')
    expect(taipeiDateISO(firing)).toBe('2026-09-17')
  })

  it('still reads the current day one minute before the rollover', () => {
    const justBefore = new Date('2026-09-16T15:59:59Z')
    expect(taipeiDateISO(justBefore)).toBe('2026-09-16')
  })
})

describe('send-recurring-push', () => {
  it('computes `today` in Taipei at its 16:10 UTC slot', () => {
    // The push runs ten minutes after the generators, on the same UTC basis —
    // so a UTC `today` here would miss precisely the cards just created and
    // announce them a night later.
    expect(taipeiDateISO(new Date('2026-09-16T16:10:00Z'))).toBe('2026-09-17')
  })

  it('does not derive the date from toISOString()', () => {
    const src = readFileSync(PUSH_FN, 'utf8')
    expect(src).toContain('taipeiDateISO()')
    expect(src).not.toMatch(/const today = new Date\(\)\.toISOString\(\)/)
  })
})
