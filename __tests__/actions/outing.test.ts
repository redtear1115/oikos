import { describe, it, expect, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { loadEnvLocal, seedGroup } from '../outing/_setup'

loadEnvLocal()

// Auth mock: getUser returns whatever mockUserId currently holds.
let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))

const { db } = await import('@/lib/db/client')
const { outings, outingParticipants } = await import('@/lib/db/schema')
const { listOutings, getOutingDetail } = await import('@/lib/db/queries/outing')
const { createOuting, addOutingParticipant } = await import('@/actions/outing')

describe('outing queries', () => {
  it('listOutings returns group/epoch outings newest first; getOutingDetail hydrates', async () => {
    const { userId, groupId, epochId } = await seedGroup()
    mockUserId = userId

    const [o] = await db.insert(outings).values({
      groupId, epochId, createdBy: userId, name: '宜蘭', currency: 'twd',
      shareToken: randomUUID(), status: 'active',
    }).returning()
    await db.insert(outingParticipants).values({
      outingId: o.id, displayName: '我', profileId: userId, claimToken: randomUUID(),
    })

    const list = await listOutings(groupId, epochId)
    expect(list.some((x) => x.id === o.id)).toBe(true)

    const detail = await getOutingDetail(o.id)
    expect(detail).not.toBeNull()
    expect(detail!.outing.name).toBe('宜蘭')
    expect(detail!.participants.length).toBe(1)
    expect(detail!.expenses).toEqual([])
    expect(detail!.settlements).toEqual([])
  })
})

describe('createOuting', () => {
  it('creates an outing + a participant per group member', async () => {
    const { userId, partnerId, groupId } = await seedGroup()
    mockUserId = userId

    const outing = await createOuting({ name: '九份' })
    expect(outing.groupId).toBe(groupId)
    expect(outing.currency).toBe('twd')
    expect(outing.shareToken).toMatch(/^[A-Za-z0-9_-]{16,}$/)

    const detail = await getOutingDetail(outing.id)
    const profileIds = detail!.participants.map((p) => p.profileId).sort()
    expect(profileIds).toEqual([userId, partnerId].sort())
    expect(detail!.participants.every((p) => p.claimedAt !== null)).toBe(true)
  })

  it('rejects an empty name', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    await expect(createOuting({ name: '   ' })).rejects.toThrow()
  })
})

describe('addOutingParticipant', () => {
  it('adds a no-account friend (profileId null, has claim token)', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '墾丁' })

    const p = await addOutingParticipant({ outingId: outing.id, displayName: '阿傑' })
    expect(p.profileId).toBeNull()
    expect(p.displayName).toBe('阿傑')
    expect(p.claimToken).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  })

  it('rejects adding to an outing of another group', async () => {
    const a = await seedGroup()
    mockUserId = a.userId
    const outing = await createOuting({ name: 'A 的出遊' })
    const b = await seedGroup()
    mockUserId = b.userId // now acting as a different group's owner
    await expect(
      addOutingParticipant({ outingId: outing.id, displayName: '亂入' }),
    ).rejects.toThrow()
  })
})
