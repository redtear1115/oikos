/**
 * #1605 — the daily "pending card due" push goes only to current members.
 *
 * Scenario (F9): A and B shared ledger G; A removed B. B's phone still has a
 * PushTokens row on G (nothing moved it). G has a pending card due today, so
 * send-recurring-push loads G's tokens. Before the fix it sent to every token
 * on G, B's included. Failure looks like: no error anywhere; the ex keeps
 * getting 「有待確認的定期收支」 for a ledger they can no longer open.
 *
 * The filter is a real unit test (memberTokens.ts, extracted because the Deno
 * entrypoint cannot be loaded under vitest); the wiring in index.ts is
 * asserted on its source, like recurring-cron-taipei-date.test.ts does.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  tokensOfCurrentMembers,
  type TokenRow,
} from '../supabase/functions/send-recurring-push/memberTokens.ts'

const A = 'aaaaaaaa-0000-4000-8000-000000000001' // stayer
const B = 'bbbbbbbb-0000-4000-8000-000000000002' // removed ex
const C = 'cccccccc-0000-4000-8000-000000000003' // later partner
const G = '99999999-0000-4000-8000-000000000009' // ledger with a card due today

describe('tokensOfCurrentMembers (#1605)', () => {
  it('the ex\'s token on G is not sent G\'s push; the stayer\'s is', () => {
    // What the token query returns for due group G after A removed B.
    const rows: TokenRow[] = [
      { token: 'tok-stayer', user_id: A, group_id: G, OikosGroups: { member_a: A, member_b: null } },
      { token: 'tok-ex', user_id: B, group_id: G, OikosGroups: { member_a: A, member_b: null } },
    ]
    expect(tokensOfCurrentMembers(rows)).toEqual(['tok-stayer'])
  })

  it('after a new partner joins, the new partner is sent it and the ex still is not', () => {
    const g = { member_a: A, member_b: C }
    const rows: TokenRow[] = [
      { token: 'tok-stayer', user_id: A, group_id: G, OikosGroups: g },
      { token: 'tok-ex', user_id: B, group_id: G, OikosGroups: g },
      { token: 'tok-new', user_id: C, group_id: G, OikosGroups: g },
    ]
    expect(tokensOfCurrentMembers(rows).sort()).toEqual(['tok-new', 'tok-stayer'])
  })

  it('fails closed on a missing or empty embed; accepts an array-shaped embed', () => {
    const rows: TokenRow[] = [
      { token: 'tok-null', user_id: A, group_id: G, OikosGroups: null },
      { token: 'tok-empty', user_id: A, group_id: G, OikosGroups: [] },
      { token: 'tok-arr', user_id: A, group_id: G, OikosGroups: [{ member_a: A, member_b: null }] },
    ]
    expect(tokensOfCurrentMembers(rows)).toEqual(['tok-arr'])
  })

  it('a device token registered by both members is pushed once', () => {
    const g = { member_a: A, member_b: C }
    const rows: TokenRow[] = [
      { token: 'tok-shared', user_id: A, group_id: G, OikosGroups: g },
      { token: 'tok-shared', user_id: C, group_id: G, OikosGroups: g },
    ]
    expect(tokensOfCurrentMembers(rows)).toEqual(['tok-shared'])
  })
})

describe('send-recurring-push wiring (#1605)', () => {
  const src = readFileSync(
    join(process.cwd(), 'supabase/functions/send-recurring-push/index.ts'),
    'utf8',
  )

  it('loads each token with its group\'s members over the group_id FK', () => {
    expect(src).toContain("select('token, user_id, group_id, OikosGroups!inner(member_a, member_b)')")
  })

  it('sends only what the member filter returns', () => {
    expect(src).toContain('tokensOfCurrentMembers(')
    // The old group-only select must not come back.
    expect(src).not.toMatch(/\.select\('token'\)/)
  })
})
