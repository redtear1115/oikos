import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockBuilder, resetDbMocks } from './_mocks/db'
import { requestAccountDeletion, cancelAccountDeletion } from '@/actions/account'
import { captureServer } from '@/lib/analytics/server'

// signOut() calls redirect() (throws NEXT_REDIRECT) + analytics; stub both so
// we can assert the DB write without the redirect aborting the test.
vi.mock('@/actions/auth', () => ({ signOut: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/server', () => ({ captureServer: vi.fn(async () => {}) }))

const VIEWER = { id: 'user-a', email: 'a@example.com' }

beforeEach(() => {
  resetDbMocks()
})

describe('requestAccountDeletion', () => {
  it('stamps deletion_requested_at on the viewer profile', async () => {
    setMockUser(VIEWER)
    await requestAccountDeletion()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.deletionRequestedAt).toBeInstanceOf(Date)
    expect(vi.mocked(captureServer)).toHaveBeenCalledWith('user-a', 'account_deletion_requested')
  })

  it('rejects when unauthenticated', async () => {
    setMockUser(null)
    await expect(requestAccountDeletion()).rejects.toThrow('Unauthorized')
  })
})

describe('cancelAccountDeletion', () => {
  it('clears deletion_requested_at on the viewer profile', async () => {
    setMockUser(VIEWER)
    await cancelAccountDeletion()
    const set = mockBuilder.set.mock.calls[0][0] as Record<string, unknown>
    expect(set.deletionRequestedAt).toBeNull()
    expect(vi.mocked(captureServer)).toHaveBeenCalledWith('user-a', 'account_deletion_cancelled')
  })

  it('rejects when unauthenticated', async () => {
    setMockUser(null)
    await expect(cancelAccountDeletion()).rejects.toThrow('Unauthorized')
  })
})
