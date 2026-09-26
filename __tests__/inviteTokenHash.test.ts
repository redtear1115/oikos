import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── #1288 I3b — invite tokens are looked up by their hash ────────────────
//
// 1. `hashToken` must produce exactly what the backfill in
//    `drizzle/0070_invite_token_hash_expand.sql` writes:
//    encode(sha256(convert_to(token, 'UTF8')), 'hex'). The vectors below were
//    computed by Postgres 17 from that expression. If the two ever disagree,
//    every backfilled invite stops matching and nothing errors: the link just
//    reads "invalid or expired".
//
// 2. The format guard. previewInvite / acceptInvite reject anything that is
//    not a 43-character base64url string (what `generateToken` returns)
//    before any database call. The db client is replaced by a proxy that
//    records every access, so "before any DB call" is observed, not assumed.
// ──────────────────────────────────────────────────────────────────────────

const dbTouches: string[] = []
vi.mock('@/lib/db/client', () => ({
  db: new Proxy({}, {
    get(_t, prop) {
      dbTouches.push(String(prop))
      throw new Error('db accessed')
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-4000-8000-000000000001' } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
const captured: Array<{ event: string; props: unknown }> = []
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async (_id: string, event: string, props: unknown) => { captured.push({ event, props }) },
  isUserFirstNonDeletedRecord: async () => false,
}))

const { generateToken, hashToken, isWellFormedInviteToken } = await import('@/lib/invite')
const { previewInvite, acceptInvite } = await import('@/actions/invite')

beforeEach(() => {
  dbTouches.length = 0
  captured.length = 0
})

describe('hashToken (#1288 I3b)', () => {
  it('matches the Postgres sha256 test vectors', () => {
    // SELECT encode(sha256(convert_to('<v>', 'UTF8')), 'hex')
    expect(hashToken('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))
      .toBe('0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a')
    expect(hashToken('__________________________________________8'))
      .toBe('225f7e75329dd45aa354975d73987319309393af3a4c6733bc13601a4f1b8796')
  })

  it('is 64 lowercase hex characters and differs from its input', () => {
    const t = generateToken()
    const h = hashToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(t)
  })
})

describe('isWellFormedInviteToken (#1288 I3b)', () => {
  it('accepts what generateToken mints', () => {
    for (let i = 0; i < 200; i++) expect(isWellFormedInviteToken(generateToken())).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['one short', 'A'.repeat(42)],
    ['one long', 'A'.repeat(44)],
    ['padded base64', 'A'.repeat(42) + '='],
    ['standard base64 alphabet', 'A'.repeat(41) + '+/'],
    ['whitespace', 'A'.repeat(42) + ' '],
    ['trailing newline', 'A'.repeat(43) + '\n'],
    ['percent-encoded', 'A'.repeat(40) + '%2F'],
    ['non-ASCII', 'A'.repeat(42) + 'é'],
    ['old-style test fixture', 'TEST_912_' + '00000000-0000-4000-8000-000000000000'],
  ])('rejects %s', (_label, value) => {
    expect(isWellFormedInviteToken(value)).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isWellFormedInviteToken(undefined as unknown as string)).toBe(false)
    expect(isWellFormedInviteToken(null as unknown as string)).toBe(false)
    expect(isWellFormedInviteToken(42 as unknown as string)).toBe(false)
  })
})

describe('malformed tokens never reach the database (#1288 I3b)', () => {
  const malformed = ['', 'A'.repeat(42), 'A'.repeat(42) + '=', "' OR 1=1 --", 'TEST_REMOVE_TOKEN_x']

  it.each(malformed.map((m) => [JSON.stringify(m).slice(0, 24), m]))('previewInvite(%s) → invalid_or_expired, 0 DB accesses', async (_l, token) => {
    const res = await previewInvite(token)
    expect(res).toEqual({ ok: true, data: { ok: false, error: 'invalid_or_expired' } })
    expect(dbTouches).toEqual([])
    // Same analytics as an unknown token; the code only, never the input.
    expect(captured).toEqual([{ event: 'invite_preview_failed', props: { code: 'invalid_or_expired' } }])
  })

  it.each(malformed.map((m) => [JSON.stringify(m).slice(0, 24), m]))('acceptInvite(%s) → invalid_or_expired, 0 DB accesses', async (_l, token) => {
    const res = await acceptInvite(token)
    expect(res).toEqual({ ok: false, code: 'invalid_or_expired' })
    expect(dbTouches).toEqual([])
    expect(captured).toEqual([])
  })

  it('control: a well-formed token does reach the database', async () => {
    await expect(previewInvite(generateToken())).rejects.toThrow()
    expect(dbTouches.length).toBeGreaterThan(0)
  })
})
