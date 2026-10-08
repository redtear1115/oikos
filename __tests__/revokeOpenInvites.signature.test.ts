import { describe, it, expect } from 'vitest'
import type { revokeOpenInvites } from '@/actions/invite'

// ─── #1546 (type layer), same guard as createInvite.signature.test.ts ─────
//
// `revokeOpenInvites` must not accept a group id from the caller (#1031): the
// group is resolved from the viewer via `requireViewerGroup()`. A `groupId`
// parameter would let anyone signed in kill any ledger's invite link — and a
// group id is not a secret (it ships in every dashboard RSC payload).
//
// Enforced by `tsc --noEmit`, not by the vitest runtime. The behavioural half
// (a member of another ledger, a former partner) is in
// `__tests__/actions/invite.revoke.test.ts` (#5a–#5c).
// ──────────────────────────────────────────────────────────────────────────

type Expect<T extends true> = T

type _RevokeTakesNoArguments = Expect<
  Parameters<typeof revokeOpenInvites>['length'] extends 0 ? true : false
>

type _RevokeRejectsAGroupId = Expect<
  [string] extends Parameters<typeof revokeOpenInvites> ? false : true
>

describe('revokeOpenInvites signature (#1546)', () => {
  it('is pinned at compile time by tsc --noEmit', () => {
    expect(true).toBe(true)
  })
})
