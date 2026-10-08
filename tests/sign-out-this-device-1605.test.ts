/**
 * #1605 (F11) — sign-out drops this device's push registration, and never
 * waits on or fails because of it.
 *
 * The row-level half (T1 gone, T2 kept) runs against dev in
 * __tests__/actions/pushTokens1605.test.ts. Since #1617 the delete lives in
 * the signOut action itself; its ordering, 2 s bound and "sign-out still
 * completes" guarantees are in tests/sign-out-single-action-1617.test.ts,
 * LogoutButton's behaviour in tests/logout-single-action-1617.test.tsx and the
 * layout's in tests/dashboard-layout-push-registrar-1617.test.tsx.
 * This file keeps storage and source wiring. Failure looks like:
 * tapping 登出 hangs on a bad network or does nothing when the delete errors;
 * or a shared phone keeps getting the signed-out person's pushes.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readStoredPushToken,
  storePushToken,
  clearStoredPushToken,
} from '@/lib/pushTokenStorage'

afterEach(() => {
  vi.restoreAllMocks()
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

  it('LogoutButton calls exactly one server action: signOut, with the stored token (#1617)', () => {
    const src = read('app/(dashboard)/settings/_components/LogoutButton.tsx')
    const actionImports = [...src.matchAll(/from '@\/actions\/([\w-]+)'/g)].map((m) => m[1])
    expect(actionImports).toEqual(['auth'])
    expect(src).toMatch(/import \{ signOut \} from '@\/actions\/auth'/)
    expect(src.match(/await signOut\(/g)).toHaveLength(1)
    expect(src).toContain('await signOut(readStoredPushToken() ?? undefined)')
    expect(src).not.toMatch(/signOutThisDevice|unregisterThisDevice/)
    expect(src).toContain("window.location.replace('/')")
  })

  it('the dashboard registers the token against the active ledger, not a pinned past one (F3, #1617)', () => {
    const src = read('app/(dashboard)/layout.tsx')
    const line = src.split('\n').find((l) => l.includes('<PushTokenRegistrar'))
    // Past pin → look the active ledger up; otherwise `group` already is it.
    expect(line).toContain('epochWindow.isPast ? getActiveGroupForUser(user.id) : Promise.resolve(group)')
    expect(line).not.toContain('groupId={group.id}')
  })
})
