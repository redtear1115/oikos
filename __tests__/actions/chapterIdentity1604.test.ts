import { describe, it, expect, vi, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1604 part 1: a past chapter's 「對方」 is that chapter's partner — dev DB ───
//
// The payer filter 「誰付 = 對方」 against real SQL, on every path that
// resolves it: the /records page's first render and the pagination actions
// (loadMoreFeedAll, loadMoreTransactions, loadRecordsMonthSummaries,
// loadMoreIncomes). Plus getEpochMembers, the one source of a chapter
// member's name.
//
// Two stayers, both pinned to the closed chapter they had with an ex:
//   (a) A is now paired with C   — X: chapter A+B (closed), chapter A+C (open)
//   (b) D is now solo            — Z: chapter D+E (closed), chapter D (open)
//
// Failure this guards: the resolver read today's group row, so in (a)
// 「對方」 matched C's id (zero rows in the old chapter) and in (b) the solo
// sentinel (zero rows) — the ex's rows vanished under the filter, with no
// error. And the first page and later pages must agree.
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

let viewer = ''
let pin: string | undefined
vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: async () => ({ id: viewer }),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: viewer } }, error: null }) },
  }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (k === 'futari_past_epoch' && pin ? { value: pin } : undefined),
    getAll: () => [], has: () => false, set: () => {}, delete: () => {},
  }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupEpochs, groupBalance, cashTransactions, incomeTransactions,
} = await import('@/lib/db/schema')
const { eq, inArray } = await import('drizzle-orm')
const { getEpochMembers, resolveViewedPair, resolveViewerEpochContext } = await import('@/lib/db/queries/epoch')
const { loadMoreFeedAll, loadMoreTransactions, loadRecordsMonthSummaries } = await import('@/actions/transaction')
const { loadMoreIncomes } = await import('@/actions/income')
const { defaultFilter, toWire } = await import('@/lib/filter')
const { default: RecordsPage } = await import('@/app/(dashboard)/records/page')

const D = (iso: string) => new Date(`${iso}T00:00:00Z`)
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  pin = undefined
  viewer = ''
  for (const c of cleanups.splice(0).reverse()) await c()
})

async function seedProfiles(names: string[]) {
  const ids = names.map(() => randomUUID())
  await db.insert(profiles).values(ids.map((id, i) => ({ id, displayName: names[i] })))
  cleanups.push(async () => { await db.delete(profiles).where(inArray(profiles.id, ids)) })
  return ids
}

/**
 * stayer + ex lived a closed chapter (2025-01 → 2025-06); today the group row
 * names stayer + `now` (null = solo) and a new open chapter. Each person who
 * was in the closed chapter recorded one expense and one income in it; `now`
 * recorded one expense in the open chapter.
 */
async function seedStayer(now: 'paired' | 'solo') {
  const tag = now === 'paired' ? 'A' : 'D'
  const [stayer, ex, next] = await seedProfiles([`TEST_1604_${tag}`, `TEST_1604_${tag}_ex`, `TEST_1604_${tag}_next`])
  const nowB = now === 'paired' ? next : null
  const [g] = await db.insert(oikosGroups).values({
    name: 'TEST_1604', memberA: stayer, memberB: nowB, currentEpochStartedAt: D('2025-06-01'), baseCurrency: 'twd',
  }).returning()
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0 })
  const [closed, open] = await db.insert(groupEpochs).values([
    { groupId: g.id, memberAId: stayer, memberBId: ex, startedAt: D('2025-01-01'), endedAt: D('2025-06-01') },
    { groupId: g.id, memberAId: stayer, memberBId: nowB, startedAt: D('2025-06-01'), endedAt: null },
  ]).returning({ id: groupEpochs.id })
  const inClosed = D('2025-03-01')
  const cash = await db.insert(cashTransactions).values([
    { groupId: g.id, paidBy: ex, amount: 100, splitType: 'half', description: 'TEST_1604 ex paid', category: 'dining', transactedAt: inClosed, createdAt: inClosed },
    { groupId: g.id, paidBy: stayer, amount: 200, splitType: 'half', description: 'TEST_1604 stayer paid', category: 'dining', transactedAt: inClosed, createdAt: inClosed },
    ...(nowB ? [{ groupId: g.id, paidBy: nowB, amount: 300, splitType: 'half' as const, description: 'TEST_1604 next paid', category: 'dining', transactedAt: D('2025-07-01') }] : []),
  ]).returning({ id: cashTransactions.id, paidBy: cashTransactions.paidBy })
  const income = await db.insert(incomeTransactions).values([
    { groupId: g.id, recipientId: ex, amount: 1000, category: 'salary', occurredAt: '2025-03-01', createdAt: inClosed },
    { groupId: g.id, recipientId: stayer, amount: 2000, category: 'salary', occurredAt: '2025-03-01', createdAt: inClosed },
  ]).returning({ id: incomeTransactions.id, recipientId: incomeTransactions.recipientId })
  cleanups.push(async () => {
    await db.delete(cashTransactions).where(eq(cashTransactions.groupId, g.id))
    await db.delete(incomeTransactions).where(eq(incomeTransactions.groupId, g.id))
    await db.delete(groupEpochs).where(eq(groupEpochs.groupId, g.id))
    await db.delete(groupBalance).where(eq(groupBalance.groupId, g.id))
    await db.delete(oikosGroups).where(eq(oikosGroups.id, g.id))
  })
  const id = (who: string) => cash.find((r) => r.paidBy === who)!.id
  return {
    stayer, ex, next, groupId: g.id, closed: closed.id, open: open.id,
    exCash: id(ex), stayerCash: id(stayer), nextCash: nowB ? id(nowB) : null,
    exIncome: income.find((r) => r.recipientId === ex)!.id,
  }
}

const theirs = toWire({ ...defaultFilter(), payer: 'theirs' })
const unwrap = <T>(r: unknown): T => {
  const v = r as { ok: boolean; data?: T; code?: string }
  if (v && typeof v === 'object' && 'ok' in v) {
    if (!v.ok) throw new Error(`action failed: ${v.code}`)
    return v.data as T
  }
  return r as T
}

describe.each(['paired', 'solo'] as const)('stayer now %s, pinned to the closed chapter with the ex (#1604)', (now) => {
  it('getEpochMembers names the ex, not whoever is in the group today', async () => {
    const s = await seedStayer(now)
    const m = await getEpochMembers(s.closed)
    expect(m).toMatchObject({ memberAId: s.stayer, memberBId: s.ex })
    expect(m!.memberBName).toBe(now === 'paired' ? 'TEST_1604_A_ex' : 'TEST_1604_D_ex')
  })

  it("resolveViewedPair is the chapter's pair when pinned", async () => {
    const s = await seedStayer(now)
    pin = s.closed
    const ctx = await resolveViewerEpochContext(s.stayer)
    expect(ctx!.window.isPast).toBe(true)
    expect(await resolveViewedPair(ctx!, s.stayer)).toEqual({ memberA: s.stayer, memberB: s.ex })
  })

  it("/records first render: 「對方」 returns the ex's rows", async () => {
    const s = await seedStayer(now)
    viewer = s.stayer
    pin = s.closed
    const el = await RecordsPage({ searchParams: Promise.resolve({ range: 'all', fPayer: 'theirs' }) })
    const initial = (el as { props: { initial: { id: string; paidBy: string }[] } }).props.initial
    const ids = initial.map((r) => r.id)
    expect(ids).toContain(s.exCash)
    expect(ids).toContain(s.exIncome)
    expect(ids).not.toContain(s.stayerCash)
    for (const r of initial) expect(r.paidBy).toBe(s.ex)
  })

  it("pagination actions: 「對方」 returns the ex's rows, matching the first render", async () => {
    const s = await seedStayer(now)
    viewer = s.stayer
    pin = s.closed

    const feed = unwrap<{ id: string; paidBy: string }[]>(await loadMoreFeedAll(null, 20, undefined, undefined, theirs, { kind: 'all' }))
    expect(feed.map((r) => r.id)).toEqual(expect.arrayContaining([s.exCash, s.exIncome]))
    for (const r of feed) expect(r.paidBy).toBe(s.ex)

    const tx = unwrap<{ id: string; paidBy: string }[]>(await loadMoreTransactions(null, 20, theirs, undefined, undefined, { kind: 'all' }))
    expect(tx.map((r) => r.id)).toEqual([s.exCash])

    const inc = unwrap<{ id: string; recipientId: string }[]>(await loadMoreIncomes(null, 20, undefined, undefined, theirs, { kind: 'all' }))
    expect(inc.map((r) => r.id)).toEqual([s.exIncome])

    const sumAll = unwrap<{ count: number }[]>(await loadRecordsMonthSummaries('all', undefined, undefined, theirs, { kind: 'all' }))
    expect(sumAll.reduce((n, m) => n + m.count, 0)).toBe(2)
    const sumInc = unwrap<{ count: number }[]>(await loadRecordsMonthSummaries('income', undefined, undefined, theirs, { kind: 'all' }))
    expect(sumInc.reduce((n, m) => n + m.count, 0)).toBe(1)
  })
})

describe('live (unpinned) records are unchanged (#1604)', () => {
  it("「對方」 is today's partner: C's row, none of the ex's", async () => {
    const s = await seedStayer('paired')
    viewer = s.stayer
    const feed = unwrap<{ id: string; paidBy: string }[]>(await loadMoreFeedAll(null, 20, undefined, undefined, theirs, { kind: 'all' }))
    expect(feed.map((r) => r.id)).toEqual([s.nextCash])

    const el = await RecordsPage({ searchParams: Promise.resolve({ range: 'all', fPayer: 'theirs' }) })
    const initial = (el as { props: { initial: { id: string }[] } }).props.initial
    expect(initial.map((r) => r.id)).toEqual([s.nextCash])
  })

  it("a solo stayer's live 「對方」 matches nothing (sentinel), as before", async () => {
    const s = await seedStayer('solo')
    viewer = s.stayer
    const feed = unwrap<unknown[]>(await loadMoreFeedAll(null, 20, undefined, undefined, theirs, { kind: 'all' }))
    expect(feed).toEqual([])
  })
})
