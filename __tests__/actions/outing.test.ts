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
const {
  createOuting, addOutingParticipant, addOutingExpense, recordOutingSettlement,
  endOuting, softDeleteOuting,
} = await import('@/actions/outing')
const { outingExpenseShares: sharesTable } = await import('@/lib/db/schema')
const { eq: eqOp } = await import('drizzle-orm')

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

describe('addOutingExpense', () => {
  it('splits equally across chosen participants (Σ shares === amount)', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '台中' })
    const friend = await addOutingParticipant({ outingId: outing.id, displayName: '小明' })
    const detail0 = await getOutingDetail(outing.id)
    const me = detail0!.participants.find((p) => p.profileId === userId)!

    const expense = await addOutingExpense({
      outingId: outing.id,
      paidByParticipantId: me.id,
      amount: 100,
      participantIds: [me.id, friend.id],
      description: '午餐',
    })

    const shares = await db.select().from(sharesTable).where(eqOp(sharesTable.expenseId, expense.id))
    expect(shares.reduce((s, x) => s + x.shareAmount, 0)).toBe(100)
    expect(shares.length).toBe(2)
  })

  it('rejects amount <= 0 and empty participant list', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '高雄' })
    const detail = await getOutingDetail(outing.id)
    const me = detail!.participants[0]
    await expect(addOutingExpense({
      outingId: outing.id, paidByParticipantId: me.id, amount: 0, participantIds: [me.id],
    })).rejects.toThrow()
    await expect(addOutingExpense({
      outingId: outing.id, paidByParticipantId: me.id, amount: 100, participantIds: [],
    })).rejects.toThrow()
  })

  it('rejects participants not in this outing', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '花蓮' })
    const detail = await getOutingDetail(outing.id)
    const me = detail!.participants[0]
    await expect(addOutingExpense({
      outingId: outing.id, paidByParticipantId: me.id, amount: 100, participantIds: [randomUUID()],
    })).rejects.toThrow()
  })
})

describe('recordOutingSettlement', () => {
  it('records a repayment between two participants', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '宜花東' })
    const friend = await addOutingParticipant({ outingId: outing.id, displayName: '阿宏' })
    const detail = await getOutingDetail(outing.id)
    const me = detail!.participants.find((p) => p.profileId === userId)!

    const s = await recordOutingSettlement({
      outingId: outing.id, fromParticipantId: friend.id, toParticipantId: me.id, amount: 50,
    })
    expect(s.amount).toBe(50)

    const after = await getOutingDetail(outing.id)
    expect(after!.settlements.length).toBe(1)
  })

  it('rejects from === to and non-positive amount', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '澎湖' })
    const detail = await getOutingDetail(outing.id)
    const me = detail!.participants[0]
    await expect(recordOutingSettlement({
      outingId: outing.id, fromParticipantId: me.id, toParticipantId: me.id, amount: 10,
    })).rejects.toThrow()
    await expect(recordOutingSettlement({
      outingId: outing.id, fromParticipantId: me.id, toParticipantId: detail!.participants[1].id, amount: 0,
    })).rejects.toThrow()
  })
})

describe('endOuting / softDeleteOuting', () => {
  it('endOuting closes an active outing and is idempotent', async () => {
    const { userId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '蘭嶼' })

    const ended = await endOuting({ outingId: outing.id })
    expect(ended.status).toBe('ended')
    expect(ended.endedAt).not.toBeNull()
    // second call: already ended → throws (no double-close)
    await expect(endOuting({ outingId: outing.id })).rejects.toThrow()
  })

  it('softDeleteOuting hides it from listOutings', async () => {
    const { userId, groupId, epochId } = await seedGroup()
    mockUserId = userId
    const outing = await createOuting({ name: '綠島' })
    await softDeleteOuting({ outingId: outing.id })
    const list = await listOutings(groupId, epochId)
    expect(list.some((x) => x.id === outing.id)).toBe(false)
  })
})
