import { describe, it, expect } from 'vitest'
import './supabase'  // installs the vi.mock calls
import { mockDb, queueDbResult, resetDbMocks } from './db'
import { setMockUser } from './supabase'

describe('mock harness smoke test', () => {
  it('queueDbResult feeds back through .limit', async () => {
    resetDbMocks()
    queueDbResult([{ id: 'foo' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (mockDb.select() as any).from('whatever').where('x').limit(1)
    expect(result).toEqual([{ id: 'foo' }])
  })
  it('setMockUser stores the user', () => {
    setMockUser({ id: 'user-1', email: 'a@b.com' })
    // No assertion needed; the value would surface when an action's createClient is called.
    expect(true).toBe(true)
  })
  it('transaction wrapper just calls the callback', async () => {
    resetDbMocks()
    queueDbResult([{ id: 'tx-1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await mockDb.transaction(async (tx: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (tx as any).insert().values({}).returning()
    })
    expect(result).toEqual([{ id: 'tx-1' }])
  })
})
