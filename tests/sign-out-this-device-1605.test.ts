/**
 * #1605 (F11) — sign-out drops this device's push registration, and never
 * waits on or fails because of it.
 *
 * The row-level half (T1 gone, T2 kept) runs against dev in
 * __tests__/actions/pushTokens1605.test.ts; this file covers the ordering and
 * the "sign-out still completes" guarantees with fakes. Failure looks like:
 * tapping 登出 hangs on a bad network or does nothing when the delete errors;
 * or a shared phone keeps getting the signed-out person's pushes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { signOutThisDevice, UNREGISTER_TIMEOUT_MS } from '@/lib/signOutThisDevice'
import {
  PUSH_TOKEN_STORAGE_KEY,
  readStoredPushToken,
  storePushToken,
  clearStoredPushToken,
} from '@/lib/pushTokenStorage'

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('signOutThisDevice', () => {
  it('deletes this device\'s token first, then signs out, then forgets the token', async () => {
    storePushToken('T1')
    const calls: string[] = []
    await signOutThisDevice({
      unregister: async (t) => { calls.push(`unregister:${t}`) },
      signOut: async () => { calls.push(`signOut:${localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)}`) },
    })
    expect(calls).toEqual(['unregister:T1', 'signOut:T1'])
    expect(localStorage.getItem(PUSH_TOKEN_STORAGE_KEY)).toBeNull()
  })

  it('with nothing stored, skips the delete and signs out', async () => {
    const unregister = vi.fn(async () => {})
    const signOut = vi.fn(async () => {})
    await signOutThisDevice({ unregister, signOut })
    expect(unregister).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('a failing delete (rejects, throws synchronously) does not stop sign-out', async () => {
    for (const unregister of [
      async () => { throw new Error('network down') },
      () => { throw new Error('sync throw') },
    ]) {
      storePushToken('T1')
      const signOut = vi.fn(async () => {})
      await signOutThisDevice({ unregister, signOut })
      expect(signOut).toHaveBeenCalledOnce()
      expect(readStoredPushToken()).toBeNull()
    }
  })

  it('a delete that never answers is abandoned after the timeout and sign-out goes ahead', async () => {
    vi.useFakeTimers()
    storePushToken('T1')
    const signOut = vi.fn(async () => {})
    const done = signOutThisDevice({ unregister: () => new Promise(() => {}), signOut })
    await vi.advanceTimersByTimeAsync(UNREGISTER_TIMEOUT_MS - 1)
    expect(signOut).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(signOut).toHaveBeenCalledOnce()
    expect(UNREGISTER_TIMEOUT_MS).toBeLessThanOrEqual(2000)
  })

  it('a failing sign-out still resolves (the caller\'s hard navigation then runs)', async () => {
    storePushToken('T1')
    await expect(signOutThisDevice({
      unregister: async () => {},
      signOut: async () => { throw new Error('NEXT_REDIRECT') },
    })).resolves.toBeUndefined()
  })
})

describe('pushTokenStorage never throws', () => {
  it('survives a storage that throws on every access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError') })
    expect(() => storePushToken('T1')).not.toThrow()
    expect(readStoredPushToken()).toBeNull()
    expect(() => clearStoredPushToken()).not.toThrow()
  })
})

describe('wiring (native contract surface)', () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('the registration listener stores the token', () => {
    expect(read('lib/pushNotifications.ts')).toMatch(/addListener\('registration'[\s\S]*storePushToken\(token\)/)
  })

  it('LogoutButton signs out through signOutThisDevice with the unregister action', () => {
    const src = read('app/(dashboard)/settings/_components/LogoutButton.tsx')
    expect(src).toContain('signOutThisDevice({')
    expect(src).toContain('unregisterThisDevice(token)')
    expect(src).toContain("window.location.replace('/')")
  })

  it('the dashboard registers the token against the active ledger, not the pinned one (F3)', () => {
    const src = read('app/(dashboard)/layout.tsx')
    const line = src.split('\n').find((l) => l.includes('<PushTokenRegistrar'))
    expect(line).toContain('getActiveGroupForUser(user.id)')
    expect(line).not.toContain('groupId={group.id}')
  })
})
