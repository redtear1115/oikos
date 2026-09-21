import { describe, it, expect, vi, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1380: monthly reviews follow the chapter — against the dev database ───
//
// A+B build reviews in chapter 1; B leaves and C joins, opening chapter 2.
// As C: the list and the dashboard cell hold none of A+B's months, and the
// month B left in (it straddles) belongs to neither chapter.
// Integration test: excluded from CI with the rest of __tests__/actions/**.
// ────────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
  if (!existsSync(envPath)) return
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal()

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupEpochs, groupBalance, monthlyReviewSnapshots } = await import('@/lib/db/schema')
const { eq } = await import('drizzle-orm')
const { listMonthlyReviewMonths, loadMonthlyReviewSnapshot } = await import('@/lib/db/queries/monthlyReview')
const { resolveViewerEpochContext } = await import('@/lib/db/queries/epoch')
const { isMonthInChapter } = await import('@/lib/monthlyReview')
const { deriveReviewCell } = await import('@/lib/reviewCell')

const TPE = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000)
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const c of cleanups.splice(0)) await c() })

async function seedTwoChapters() {
  const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()]
  await db.insert(profiles).values([{ id: a, displayName: 'A' }, { id: b, displayName: 'B' }, { id: c, displayName: 'C' }])
  const handover = TPE(2026, 6, 15)
  // The group as it is after B left and C joined.
  const [g] = await db.insert(oikosGroups).values({
    name: 'TEST_1380', memberA: a, memberB: c, currentEpochStartedAt: handover, baseCurrency: 'twd',
  }).returning()
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0 })
  await db.insert(groupEpochs).values([
    { groupId: g.id, startedAt: TPE(2026, 3, 1), endedAt: handover, memberAId: a, memberBId: b },
    { groupId: g.id, startedAt: handover, memberAId: a, memberBId: c },
  ])
  await db.insert(monthlyReviewSnapshots).values(
    [3, 4, 5, 6, 7, 8].map((month) => ({ groupId: g.id, year: 2026, month, largestExpensePaidByName: month <= 6 ? 'B' : 'C' })),
  )
  cleanups.push(async () => {
    await db.delete(monthlyReviewSnapshots).where(eq(monthlyReviewSnapshots.groupId, g.id))
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, g.id))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, g.id))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, g.id))
    for (const id of [a, b, c]) await db.delete(profiles).where(eq(profiles.id, id))
  })
  return { a, b, c, groupId: g.id }
}

describe('reviews follow the chapter (#1380)', () => {
  it("C's list holds only chapter-2 months; none of A+B's, not the straddling June", async () => {
    const s = await seedTwoChapters()
    const ctx = (await resolveViewerEpochContext(s.c))!
    expect(ctx.group.id).toBe(s.groupId)
    const months = await listMonthlyReviewMonths(s.groupId, ctx.window)
    expect(months.map((m) => m.month)).toEqual([8, 7])
    for (const m of months) {
      const snap = await loadMonthlyReviewSnapshot(s.groupId, m.year, m.month)
      expect(snap?.largestExpensePaidByName).toBe('C') // nothing from B's chapter reaches C
    }
  })

  it("C's 月回顧 cell for July (last month = June, straddling) is not A+B's review", async () => {
    const s = await seedTwoChapters()
    const ctx = (await resolveViewerEpochContext(s.c))!
    const june = { year: 2026, month: 6 }
    const raw = await loadMonthlyReviewSnapshot(s.groupId, 2026, 6)
    expect(raw).not.toBeNull() // the row exists…
    const months = await listMonthlyReviewMonths(s.groupId, ctx.window)
    const cell = deriveReviewCell({
      previousMonth: june,
      previousSnapshot: raw && isMonthInChapter(june, ctx.window) ? raw : null, // …but is not C's
      viewerIsA: false,
      hasAnyReview: months.length > 0,
    })
    expect(cell).toEqual({ kind: 'return' }) // July/August exist in C's chapter; June is never offered
  })

  it('A months (March–May) are not in C\'s chapter window → /review/[month] 404s them', async () => {
    const s = await seedTwoChapters()
    const ctx = (await resolveViewerEpochContext(s.c))!
    for (const month of [3, 4, 5, 6]) expect(isMonthInChapter({ year: 2026, month }, ctx.window)).toBe(false)
    for (const month of [7, 8]) expect(isMonthInChapter({ year: 2026, month }, ctx.window)).toBe(true)
  })
})
