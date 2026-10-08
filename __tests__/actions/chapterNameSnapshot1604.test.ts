import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedAuthUsers, deleteAuthUsers } from './_authUser'

// ─── #1604 part 2: a past chapter keeps the names it closed with — dev DB ───
//
// Migration 0088 freezes both members' display names on a GroupEpochs row
// when the chapter closes (trigger GroupEpochs_snapshot_member_names). Every
// close path the app has is driven here for real — leaveGroup, acceptInvite
// (the inviter's solo chapter AND the joiner's own solo chapter), and
// removePartner — then everyone renames, and the readers must keep the names
// of the moment each chapter closed:
//   - getEpochMembers (the one chapter-name source; the S3 chapter identity,
//     the review page and PartnerLeftCard read it);
//   - listEpochsForViewer (the 過去的時光 list).
// The open chapter keeps the live name.
//
// Failure this guards: nothing errors; open an old chapter and the other
// person carries a name they picked months after it ended.
// Needs 0088 applied to the database (.env.local → oikos-dev).
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

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  getCurrentUser: async () => ({ id: mockUserId }),
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs, groupInvites, cashTransactions, settlements, incomeTransactions,
} = await import('@/lib/db/schema')
const { leaveGroup, removePartner } = await import('@/actions/membership')
const { createInvite, acceptInvite } = await import('@/actions/invite')
const { getEpochMembers, listEpochsForViewer } = await import('@/lib/db/queries/epoch')
const { buildChapterIdentity } = await import('@/lib/chapterIdentity')
const { unwrapAction } = await import('@/lib/action-errors')
const { and, eq, inArray, or, isNull } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set; cannot run integration test.')
})

const created: string[] = []
afterEach(async () => {
  if (created.length === 0) return
  const groups = await db
    .select({ id: oikosGroups.id })
    .from(oikosGroups)
    .where(or(inArray(oikosGroups.memberA, created), inArray(oikosGroups.memberB, created)))
  const epochGroups = await db
    .select({ id: groupEpochs.groupId })
    .from(groupEpochs)
    .where(or(inArray(groupEpochs.memberAId, created), inArray(groupEpochs.memberBId, created)))
  const ids = Array.from(new Set([...groups, ...epochGroups].map((g) => g.id)))
  if (ids.length) {
    await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, ids))
    await db.delete(incomeTransactions).where(inArray(incomeTransactions.groupId, ids))
    await db.delete(settlements).where(inArray(settlements.groupId, ids))
    await db.delete(groupInvites).where(inArray(groupInvites.groupId, ids))
    await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, ids))
    await db.delete(groupBalance).where(inArray(groupBalance.groupId, ids))
    await db.delete(oikosGroups).where(inArray(oikosGroups.id, ids))
  }
  await deleteAuthUsers(created)
  await db.delete(profiles).where(inArray(profiles.id, created))
  created.length = 0
})

async function person(name: string): Promise<string> {
  const id = randomUUID()
  await db.insert(profiles).values({ id, displayName: name })
  await seedAuthUsers([{ id, displayName: name }])
  created.push(id)
  return id
}

async function soloOrDuo(memberA: string, memberB: string | null, name: string): Promise<string> {
  const startedAt = new Date(Date.now() - 48 * 60 * 60 * 1000)
  const [g] = await db.insert(oikosGroups)
    .values({ name, memberA, memberB, currentEpochStartedAt: startedAt })
    .returning({ id: oikosGroups.id })
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  await db.insert(groupEpochs).values({ groupId: g.id, startedAt, memberAId: memberA, memberBId: memberB })
  return g.id
}

const rename = (id: string, displayName: string) =>
  db.update(profiles).set({ displayName }).where(eq(profiles.id, id))

async function snapshotOf(epochId: string) {
  const [row] = await db
    .select({ endedAt: groupEpochs.endedAt, a: groupEpochs.memberAName, b: groupEpochs.memberBName })
    .from(groupEpochs)
    .where(eq(groupEpochs.id, epochId))
  return row
}

async function closedChapter(groupId: string, memberA: string, memberB: string | null) {
  const [row] = await db
    .select({ id: groupEpochs.id })
    .from(groupEpochs)
    .where(and(
      eq(groupEpochs.groupId, groupId),
      eq(groupEpochs.memberAId, memberA),
      memberB === null ? isNull(groupEpochs.memberBId) : eq(groupEpochs.memberBId, memberB),
    ))
  return row.id
}

describe('every close path freezes the names of that moment (#1604 part 2)', () => {
  it('leaveGroup → acceptInvite → removePartner, then everyone renames', async () => {
    const A = await person('TEST_1604S4_A')
    const B = await person('TEST_1604S4_B')
    const C = await person('TEST_1604S4_C')
    const x = await soloOrDuo(A, B, 'TEST_1604S4_X')
    const cSolo = await soloOrDuo(C, null, 'TEST_1604S4_C_solo')

    // 1. B leaves: chapter A+B closes.
    mockUserId = B
    unwrapAction(await leaveGroup())
    const chAB = await closedChapter(x, A, B)
    expect(await snapshotOf(chAB)).toMatchObject({ a: 'TEST_1604S4_A', b: 'TEST_1604S4_B' })
    expect((await snapshotOf(chAB)).endedAt).not.toBeNull()

    // A renames before C joins: the next close freezes the NEW name of A.
    await rename(A, 'TEST_1604S4_A2')

    // 2. C accepts A's invite: A's solo chapter and C's own solo chapter close.
    mockUserId = A
    const url = unwrapAction(await createInvite())
    const token = new URL(url).pathname.split('/').pop()!
    mockUserId = C
    unwrapAction(await acceptInvite(token))
    const chASolo = await closedChapter(x, A, null)
    expect(await snapshotOf(chASolo)).toMatchObject({ a: 'TEST_1604S4_A2', b: null })
    const chCSolo = await closedChapter(cSolo, C, null)
    expect(await snapshotOf(chCSolo)).toMatchObject({ a: 'TEST_1604S4_C', b: null })
    expect((await snapshotOf(chCSolo)).endedAt).not.toBeNull()

    // 3. A removes C: chapter A+C closes.
    mockUserId = A
    unwrapAction(await removePartner())
    const chAC = await closedChapter(x, A, C)
    expect(await snapshotOf(chAC)).toMatchObject({ a: 'TEST_1604S4_A2', b: 'TEST_1604S4_C' })

    // Everyone renames afterwards. No snapshot moves.
    await rename(A, 'TEST_1604S4_A_later')
    await rename(B, 'TEST_1604S4_B_later')
    await rename(C, 'TEST_1604S4_C_later')
    expect(await snapshotOf(chAB)).toMatchObject({ a: 'TEST_1604S4_A', b: 'TEST_1604S4_B' })
    expect(await snapshotOf(chAC)).toMatchObject({ a: 'TEST_1604S4_A2', b: 'TEST_1604S4_C' })

    // getEpochMembers — the one source — returns the frozen names.
    expect(await getEpochMembers(chAB)).toMatchObject({ memberBId: B, memberBName: 'TEST_1604S4_B' })
    expect(await getEpochMembers(chAC)).toMatchObject({ memberBId: C, memberBName: 'TEST_1604S4_C' })

    // The S3 chapter identity (dashboard rows, trips, filter, BrandHeader) for
    // A pinned to A+B: B as B was, no avatar.
    const identity = buildChapterIdentity(await getEpochMembers(chAB), A, '對方')
    expect(identity.partner).toMatchObject({ id: B, displayName: 'TEST_1604S4_B', avatarUrl: null })

    // 過去的時光: closed rows frozen, the open (solo) chapter live.
    const list = await listEpochsForViewer(A)
    const byId = new Map(list.map((r) => [r.id, r]))
    expect(byId.get(chAB)).toMatchObject({ memberAName: 'TEST_1604S4_A', memberBName: 'TEST_1604S4_B' })
    expect(byId.get(chASolo)).toMatchObject({ memberAName: 'TEST_1604S4_A2', memberBName: null })
    expect(byId.get(chAC)).toMatchObject({ memberAName: 'TEST_1604S4_A2', memberBName: 'TEST_1604S4_C' })
    const open = list.find((r) => r.groupId === x && r.endedAt === null)!
    expect(open).toMatchObject({ memberAId: A, memberAName: 'TEST_1604S4_A_later', memberBName: null })
    const [openRow] = await db.select({ a: groupEpochs.memberAName }).from(groupEpochs).where(eq(groupEpochs.id, open.id))
    expect(openRow.a).toBeNull() // an open chapter stores no snapshot
  }, 60000)

  it("PartnerLeftCard's source: the stayer's latest closed chapter names the leaver as they left", async () => {
    const A = await person('TEST_1604S4_P_A')
    const B = await person('TEST_1604S4_P_B')
    const x = await soloOrDuo(A, B, 'TEST_1604S4_P_X')
    mockUserId = B
    unwrapAction(await leaveGroup())
    await rename(B, 'TEST_1604S4_P_B_later')

    const { getLatestPriorClosedEpoch } = await import('@/lib/db/queries/epoch')
    const prior = await getLatestPriorClosedEpoch(x)
    expect(prior).toMatchObject({ memberAId: A, memberBId: B })
    expect((await getEpochMembers(prior!.id))!.memberBName).toBe('TEST_1604S4_P_B')
  }, 60000)
})
