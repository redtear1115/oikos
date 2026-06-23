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
