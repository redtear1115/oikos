import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── DB integration tests for removePartner (#1033) ──────────────────────
//
// removePartner is the involuntary counterpart to leaveGroup: member_a
// removes member_b unilaterally (no cooperation from member_b required).
// Covers the behaviors the ticket's spec locks down:
//   - group returns to solo (memberB cleared)
//   - old epoch closes, new solo epoch opens for member_a
//   - unaccepted GroupInvites are revoked (closing the "issuer is still a
//     member" loophole #1031 left open for a stale invite minted before
//     the removal)
//   - active trip in the current epoch blocks the removal
//   - authorization: only member_a can call this; member_b cannot
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal()

let mockUserId: string = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}))

const { db } = await import('@/lib/db/client')
const {
  profiles,
  oikosGroups,
  groupBalance,
  groupEpochs,
  groupInvites,
  trips,
} = await import('@/lib/db/schema')
const { removePartner } = await import('@/actions/membership')
const { generateToken } = await import('@/lib/invite')
const { eq, isNull, and, inArray } = await import('drizzle-orm')
const { unwrapAction } = await import('@/lib/action-errors')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

interface SeedRefs {
  userAId: string
  userBId: string
  groupId: string
  epochId: string
  tripIds: string[]
  inviteIds: string[]
}

async function seedDuoGroup(): Promise<SeedRefs> {
  const userAId = randomUUID()
  const userBId = randomUUID()
  const epochStartedAt = new Date('2026-05-10T00:00:00Z')

  await db.insert(profiles).values([
    { id: userAId, displayName: 'TEST_REMOVE_userA' },
    { id: userBId, displayName: 'TEST_REMOVE_userB' },
  ])

  const [group] = await db.insert(oikosGroups).values({
    name: 'TEST_REMOVE_duo',
    memberA: userAId,
    memberB: userBId,
    currentEpochStartedAt: epochStartedAt,
  }).returning({ id: oikosGroups.id })

  await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })

  const [epoch] = await db.insert(groupEpochs).values({
    groupId: group.id,
    startedAt: epochStartedAt,
    memberAId: userAId,
    memberBId: userBId,
  }).returning({ id: groupEpochs.id })

  return {
    userAId,
    userBId,
    groupId: group.id,
    epochId: epoch.id,
    tripIds: [],
    inviteIds: [],
  }
}

async function cleanup(refs: SeedRefs) {
  if (refs.tripIds.length) {
    await db.delete(trips).where(inArray(trips.id, refs.tripIds))
  }
  if (refs.inviteIds.length) {
    await db.delete(groupInvites).where(inArray(groupInvites.id, refs.inviteIds))
  }
  await db.delete(groupEpochs).where(eq(groupEpochs.groupId, refs.groupId))
  await db.delete(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
  await db.delete(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
  await db.delete(profiles).where(inArray(profiles.id, [refs.userAId, refs.userBId]))
}

describe('removePartner', () => {
  let activeRefs: SeedRefs | null = null

  afterEach(async () => {
    if (activeRefs) {
      try { await cleanup(activeRefs) } catch (e) { console.error('cleanup failed', e) }
      activeRefs = null
    }
  })

  it('happy path: group returns to solo, epoch closes and reopens', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    const result = unwrapAction(await removePartner())
    expect(result.groupId).toBe(refs.groupId)

    const [group] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
    expect(group.memberA).toBe(refs.userAId)
    expect(group.memberB).toBeNull()

    const oldEpoch = await db.select().from(groupEpochs).where(eq(groupEpochs.id, refs.epochId))
    expect(oldEpoch[0].endedAt).not.toBeNull()

    const openEpochs = await db.select().from(groupEpochs).where(and(
      eq(groupEpochs.groupId, refs.groupId),
      isNull(groupEpochs.endedAt),
    ))
    expect(openEpochs).toHaveLength(1)
    // The returned epochId is the new solo epoch — RemovePartnerFlow keys its
    // client flag off it so PartnerLeftCard shows the removal variant (#1121).
    expect(result.epochId).toBe(openEpochs[0].id)
    expect(openEpochs[0].memberAId).toBe(refs.userAId)
    expect(openEpochs[0].memberBId).toBeNull()

    const [bal] = await db.select().from(groupBalance).where(eq(groupBalance.groupId, refs.groupId))
    expect(bal.balance).toBe(0)
  })

  it('revokes unaccepted invites, including one minted by the still-member remover before removal', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    const [invite] = await db.insert(groupInvites).values({
      groupId: refs.groupId,
      invitedBy: refs.userAId,
      token: generateToken(), // a well-formed token (#1288 I3b)
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).returning({ id: groupInvites.id })
    refs.inviteIds.push(invite.id)

    unwrapAction(await removePartner())

    const [row] = await db.select().from(groupInvites).where(eq(groupInvites.id, invite.id))
    expect(row.revokedAt).not.toBeNull()
  })

  it('does not revoke already-accepted invites', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    const [invite] = await db.insert(groupInvites).values({
      groupId: refs.groupId,
      invitedBy: refs.userAId,
      token: generateToken(), // a well-formed token (#1288 I3b)
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: new Date('2026-05-11T00:00:00Z'),
    }).returning({ id: groupInvites.id })
    refs.inviteIds.push(invite.id)

    unwrapAction(await removePartner())

    const [row] = await db.select().from(groupInvites).where(eq(groupInvites.id, invite.id))
    expect(row.revokedAt).toBeNull()
  })

  it('rejects with active_trip when an active trip exists in the current epoch', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Blocking trip',
      startDate: '2026-05-10',
      status: 'active',
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    expect(await removePartner()).toEqual({ ok: false, code: 'active_trip' })

    // Group must be untouched — still duo, same open epoch.
    const [group] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
    expect(group.memberB).toBe(refs.userBId)
  })

  it('allows removal when trips exist but are all ended', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    const [trip] = await db.insert(trips).values({
      groupId: refs.groupId,
      epochId: refs.epochId,
      name: 'Ended trip',
      startDate: '2026-05-10',
      endDate: '2026-05-15',
      status: 'ended',
      endedAt: new Date(),
    }).returning({ id: trips.id })
    refs.tripIds.push(trip.id)

    const result = unwrapAction(await removePartner())
    expect(result.groupId).toBe(refs.groupId)
  })

  it('rejects when the caller is member_b, not member_a', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userBId

    expect(await removePartner()).toEqual({ ok: false, code: 'only_member_a_can_remove' })

    // Nothing should have changed.
    const [group] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, refs.groupId))
    expect(group.memberB).toBe(refs.userBId)
  })

  it('rejects on an already-solo group', async () => {
    const refs = await seedDuoGroup()
    activeRefs = refs
    mockUserId = refs.userAId

    // First removal makes it solo.
    unwrapAction(await removePartner())

    expect(await removePartner()).toEqual({ ok: false, code: 'solo_group' })
  })
})
