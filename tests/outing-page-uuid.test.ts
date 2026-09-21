import { describe, it, expect, vi } from 'vitest'

// #943 P3 — /outings/<non-uuid> is a 404, not a 500 from a failed uuid cast.
const getOutingDetail = vi.fn()
vi.mock('@/lib/db/queries/outing', () => ({ getOutingDetail }))
vi.mock('@/lib/auth/viewer', () => ({
  requireViewerGroupOrRedirect: async () => ({ group: { id: 'g1', memberA: 'a', memberB: 'b' } }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND') },
}))

const { default: OutingDetailPage } = await import('@/app/(dashboard)/outings/[id]/page')

describe('/outings/[id] with a malformed id', () => {
  it.each(['not-a-uuid', '123', "x'; select 1; --"])('%s → notFound, no query', async (id) => {
    await expect(OutingDetailPage({ params: Promise.resolve({ id }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(getOutingDetail).not.toHaveBeenCalled()
  })
})
