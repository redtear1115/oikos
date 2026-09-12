import { describe, it, expect } from 'vitest'
import type { createInvite } from '@/actions/invite'

// ─── Regression for #1031 (type layer) ────────────────────────────────────
//
// `createInvite` must not accept a group id from the caller. The old shape
// `createInvite(groupId: string)` gated on `requireViewer()` only — JWT valid,
// nothing else — so any signed-in user could mint an invite for ANY group id,
// and a group id is not a secret to an ex-partner (it ships in every dashboard
// RSC payload). The fix is structural: the parameter is gone, the group is
// resolved from the viewer via `requireViewerGroup()`.
//
// This file is the compile-time half of the guard — it is enforced by
// `tsc --noEmit`, not by the vitest runtime (vitest does not typecheck). The
// behavioural half lives in `__tests__/actions/createInvite.viewerGroup.test.ts`.
//
// The import is type-only on purpose: importing the module for real would pull
// in the Postgres client, which has no business being constructed in a unit
// test.
// ──────────────────────────────────────────────────────────────────────────

type Expect<T extends true> = T

// Fails to compile against the pre-fix signature, where Parameters<...> is
// `[groupId: string]` and `['length']` is therefore 1, not 0.
type _CreateInviteTakesNoArguments = Expect<
  Parameters<typeof createInvite>['length'] extends 0 ? true : false
>

// …and specifically must not keep a string parameter by any other name.
type _CreateInviteRejectsAGroupId = Expect<
  [string] extends Parameters<typeof createInvite> ? false : true
>

describe('createInvite signature (#1031)', () => {
  it('is pinned at compile time by tsc --noEmit', () => {
    // The assertions above are the test; this keeps vitest from reporting the
    // file as empty and documents where the real enforcement happens.
    expect(true).toBe(true)
  })
})
