import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { queueDbResult, resetDbMocks, mockBuilder, mockDb } from './_mocks/db'
import { ActionError } from '@/lib/action-errors'
import { generateToken, hashToken } from '@/lib/outing/tokens'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

// #1558 S2 — actor resolution and action refusals, against the queue-based DB
// mock (order-sensitive: one queued result per awaited query, in order). The
// real-DB half (concurrency, IDOR on real rows, cap under FOR UPDATE) lives in
// __tests__/actions/outing-link-join.test.ts and needs 0083 on dev.

const jar = new Map<string, string>()
const setCookie = vi.fn()
const deleteCookie = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: setCookie,
    delete: deleteCookie,
  })),
  headers: async () => new Headers(),
}))
vi.mock('@/lib/i18n/t', () => ({ getTranslations: async () => zhTW }))
vi.mock('@/lib/today-server', () => ({ getTodayYMD: async () => '2026-10-05' }))

const { resolveActor, lockForContentWrite, lockForAdmin, readClaimToken, claimCookieOptions } =
  await import('@/lib/outing/access')
const {
  renameOuting, endOuting, softDeleteOuting, addOutingParticipant, deactivateOutingParticipant,
  getOutingShareLink, resetOutingShareLink, releaseOutingSlot, joinOuting, bindOutingParticipant,
} = await import('@/actions/outing')
const { PAST_EPOCH_COOKIE } = await import('@/lib/db/queries/epoch')

const OUTING = '11111111-1111-4111-8111-111111111111'
const GROUP = '22222222-2222-4222-8222-222222222222'
const EPOCH = '33333333-3333-4333-8333-333333333333'
const SLOT = '44444444-4444-4444-8444-444444444444'
const ME = '55555555-5555-4555-8555-555555555555'
const PARTNER = '66666666-6666-4666-8666-666666666666'
const OTHER = '77777777-7777-4777-8777-777777777777'
const PAST = '88888888-8888-4888-8888-888888888888'

const outingRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: OUTING, groupId: GROUP, epochId: EPOCH, status: 'active', name: 'Trip', currency: 'twd', ...over,
})
const tx = mockDb as never

beforeEach(() => {
  resetDbMocks()
  jar.clear()
  setCookie.mockClear()
  deleteCookie.mockClear()
  setMockUser(null)
})

describe('readClaimToken', () => {
  it('returns a well-formed cookie token and ignores garbage', async () => {
    const t = generateToken()
    jar.set(`oc_${OUTING}`, t)
    expect(await readClaimToken(OUTING)).toBe(t)
    jar.set(`oc_${OUTING}`, 'garbage; DROP')
    expect(await readClaimToken(OUTING)).toBeNull()
  })
})

describe('resolveActor precedence (rev 2)', () => {
  it('anonymous with no cookie is nobody, without querying', async () => {
    expect(await resolveActor(tx, outingRow() as never, { userId: null, claimToken: null }, { lockGroup: false })).toBeNull()
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('cookie of an unbound active slot → cookie participant', async () => {
    queueDbResult([{ id: SLOT, profileId: null }])
    const actor = await resolveActor(tx, outingRow() as never, { userId: null, claimToken: generateToken() }, { lockGroup: false })
    expect(actor).toEqual({ kind: 'participant', via: 'cookie', userId: null, participantId: SLOT })
  })

  it('cookie that matches no active slot (released / deactivated / other outing) → nobody', async () => {
    queueDbResult([])
    expect(await resolveActor(tx, outingRow() as never, { userId: null, claimToken: generateToken() }, { lockGroup: false })).toBeNull()
  })

  it('cookie for a slot bound to another profile → nobody', async () => {
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }]) // group
    queueDbResult([]) // no own slot
    queueDbResult([{ id: SLOT, profileId: OTHER }]) // cookie slot, bound elsewhere
    expect(await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: generateToken() }, { lockGroup: false })).toBeNull()
  })

  it('session user with their own slot wins over another slot\'s cookie', async () => {
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }])
    queueDbResult([{ id: SLOT, deactivatedAt: null }])
    const actor = await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: generateToken() }, { lockGroup: false })
    expect(actor).toEqual({ kind: 'participant', via: 'session', userId: ME, participantId: SLOT })
    expect(mockDb.select).toHaveBeenCalledTimes(2) // the cookie was never looked up
  })

  it('a deactivated bound slot ignores the cookie too', async () => {
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }])
    queueDbResult([{ id: SLOT, deactivatedAt: new Date() }])
    expect(await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: generateToken() }, { lockGroup: false })).toBeNull()
  })

  it('member of the outing\'s group → member (not pinned)', async () => {
    queueDbResult([{ memberA: ME, memberB: PARTNER }])
    queueDbResult([{ id: SLOT, deactivatedAt: null }])
    const actor = await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: null }, { lockGroup: false })
    expect(actor).toEqual({ kind: 'member', userId: ME, participantId: SLOT, pinnedPast: false })
  })

  it('member pinned to an ended chapter of this group → pinnedPast', async () => {
    jar.set(PAST_EPOCH_COOKIE, PAST)
    queueDbResult([{ memberA: ME, memberB: PARTNER }])
    queueDbResult([])
    queueDbResult([{ groupId: GROUP, endedAt: new Date(), a: ME, b: PARTNER }])
    const actor = await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: null }, { lockGroup: false })
    expect(actor).toMatchObject({ kind: 'member', pinnedPast: true })
  })

  it('member of another group with no slot and no cookie → nobody', async () => {
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }])
    queueDbResult([])
    expect(await resolveActor(tx, outingRow() as never, { userId: ME, claimToken: null }, { lockGroup: false })).toBeNull()
  })
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof ActionError) return e.code
    throw e
  }
  throw new Error('expected a refusal')
}

describe('lock helpers refuse with codes', () => {
  it('unknown caller → outing_not_found', async () => {
    queueDbResult([outingRow()])
    expect(await codeOf(lockForContentWrite(tx, OUTING, { userId: null, claimToken: null }))).toBe('outing_not_found')
  })

  it('malformed outing id → outing_not_found without a query', async () => {
    expect(await codeOf(lockForContentWrite(tx, 'nope', { userId: null, claimToken: null }))).toBe('outing_not_found')
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('past-chapter-pinned member write → outing_viewing_past_chapter', async () => {
    jar.set(PAST_EPOCH_COOKIE, PAST)
    queueDbResult([outingRow()])
    queueDbResult([{ memberA: ME, memberB: PARTNER }])
    queueDbResult([])
    queueDbResult([{ groupId: GROUP, endedAt: new Date(), a: ME, b: PARTNER }])
    expect(await codeOf(lockForContentWrite(tx, OUTING, { userId: ME, claimToken: null }))).toBe('outing_viewing_past_chapter')
  })

  it('cookie participant still writes while their own ledger is pinned elsewhere', async () => {
    jar.set(PAST_EPOCH_COOKIE, PAST)
    queueDbResult([outingRow()])
    queueDbResult([{ id: SLOT, profileId: null }])
    queueDbResult([{ id: EPOCH }]) // current epoch
    const { actor } = await lockForContentWrite(tx, OUTING, { userId: null, claimToken: generateToken() })
    expect(actor).toMatchObject({ kind: 'participant', via: 'cookie' })
  })

  it('ended outing → outing_not_active', async () => {
    queueDbResult([outingRow({ status: 'ended' })])
    queueDbResult([{ id: SLOT, profileId: null }])
    expect(await codeOf(lockForContentWrite(tx, OUTING, { userId: null, claimToken: generateToken() }))).toBe('outing_not_active')
  })

  it('closed chapter → outing_epoch_closed', async () => {
    queueDbResult([outingRow()])
    queueDbResult([{ id: SLOT, profileId: null }])
    queueDbResult([{ id: PAST }])
    expect(await codeOf(lockForContentWrite(tx, OUTING, { userId: null, claimToken: generateToken() }))).toBe('outing_epoch_closed')
  })

  it('admin path refuses a participant with outing_admin_only', async () => {
    queueDbResult([outingRow()])
    queueDbResult([{ id: SLOT, profileId: null }])
    expect(await codeOf(lockForAdmin(tx, OUTING, { userId: null, claimToken: generateToken() }))).toBe('outing_admin_only')
  })
})

describe('admin-only actions return outing_admin_only to a friend (no throw)', () => {
  const cases: [string, () => Promise<unknown>][] = [
    ['renameOuting', () => renameOuting({ outingId: OUTING, name: 'x' })],
    ['endOuting', () => endOuting({ outingId: OUTING })],
    ['softDeleteOuting', () => softDeleteOuting({ outingId: OUTING })],
    ['addOutingParticipant', () => addOutingParticipant({ outingId: OUTING, displayName: 'Ann' })],
    ['deactivateOutingParticipant', () => deactivateOutingParticipant({ outingId: OUTING, participantId: SLOT })],
    ['getOutingShareLink', () => getOutingShareLink({ outingId: OUTING })],
    ['resetOutingShareLink', () => resetOutingShareLink({ outingId: OUTING })],
    ['releaseOutingSlot', () => releaseOutingSlot({ outingId: OUTING, participantId: SLOT })],
  ]
  it.each(cases)('%s', async (_name, call) => {
    jar.set(`oc_${OUTING}`, generateToken())
    queueDbResult([outingRow()])
    queueDbResult([{ id: SLOT, profileId: null }])
    expect(await call()).toEqual({ ok: false, code: 'outing_admin_only' })
  })
})

describe('joinOuting', () => {
  it('malformed token → outing_link_invalid without a query', async () => {
    expect(await joinOuting({ shareToken: 'abc', participantId: SLOT })).toEqual({ ok: false, code: 'outing_link_invalid' })
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it('unknown / reset token → outing_link_invalid', async () => {
    queueDbResult([])
    expect(await joinOuting({ shareToken: generateToken(), participantId: SLOT })).toEqual({ ok: false, code: 'outing_link_invalid' })
  })

  it('anonymous claim: stores only the hash, token only in an httpOnly Lax cookie, result has only the participant id', async () => {
    const share = generateToken()
    queueDbResult([{ id: OUTING }]) // by share hash
    queueDbResult([outingRow()]) // locked outing
    queueDbResult([{ hash: hashToken(share) }]) // re-check under lock
    queueDbResult([{ id: EPOCH }]) // current epoch
    queueDbResult([{ id: SLOT }]) // conditional claim UPDATE … RETURNING

    const res = await joinOuting({ shareToken: share, participantId: SLOT })
    expect(res).toEqual({ ok: true, data: { participantId: SLOT } })

    expect(setCookie).toHaveBeenCalledTimes(1)
    const [name, token, opts] = setCookie.mock.calls[0]
    expect(name).toBe(`oc_${OUTING}`)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' })

    const claim = mockBuilder.set.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(claim.claimTokenHash).toBe(hashToken(token))
    expect(claim.profileId).toBeNull()
    expect(claim.claimedAt).toBeInstanceOf(Date)
    expect(JSON.stringify(res)).not.toContain(token)
  })

  it('signed-in claim binds the account and sets no cookie', async () => {
    setMockUser({ id: ME })
    const share = generateToken()
    queueDbResult([{ id: OUTING }])
    queueDbResult([outingRow()])
    queueDbResult([{ hash: hashToken(share) }])
    queueDbResult([{ id: EPOCH }])
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }]) // not a member
    queueDbResult([]) // no own slot
    queueDbResult([{ id: SLOT }])
    expect(await joinOuting({ shareToken: share, participantId: SLOT })).toEqual({ ok: true, data: { participantId: SLOT } })
    expect(setCookie).not.toHaveBeenCalled()
    const claim = mockBuilder.set.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(claim).toMatchObject({ profileId: ME, claimTokenHash: null })
  })

  it('a member calling join → outing_already_joined', async () => {
    setMockUser({ id: ME })
    const share = generateToken()
    queueDbResult([{ id: OUTING }])
    queueDbResult([outingRow()])
    queueDbResult([{ hash: hashToken(share) }])
    queueDbResult([{ id: EPOCH }])
    queueDbResult([{ memberA: ME, memberB: PARTNER }])
    queueDbResult([{ id: SLOT, deactivatedAt: null }])
    expect(await joinOuting({ shareToken: share, participantId: SLOT })).toEqual({ ok: false, code: 'outing_already_joined' })
  })

  it('lost race on the slot → outing_slot_taken', async () => {
    const share = generateToken()
    queueDbResult([{ id: OUTING }])
    queueDbResult([outingRow()])
    queueDbResult([{ hash: hashToken(share) }])
    queueDbResult([{ id: EPOCH }])
    queueDbResult([]) // UPDATE matched nothing
    queueDbResult([{ id: SLOT }]) // slot exists and is active
    expect(await joinOuting({ shareToken: share, participantId: SLOT })).toEqual({ ok: false, code: 'outing_slot_taken' })
    expect(setCookie).not.toHaveBeenCalled()
  })

  it('ended outing → outing_not_active', async () => {
    const share = generateToken()
    queueDbResult([{ id: OUTING }])
    queueDbResult([outingRow({ status: 'ended' })])
    queueDbResult([{ hash: hashToken(share) }])
    expect(await joinOuting({ shareToken: share, participantId: SLOT })).toEqual({ ok: false, code: 'outing_not_active' })
  })

  it('a unique violation from a concurrent bind becomes outing_already_joined, not 23505', async () => {
    setMockUser({ id: ME })
    mockDb.transaction.mockImplementationOnce(async () => {
      throw Object.assign(new Error('dup'), { code: '23505' })
    })
    queueDbResult([{ id: OUTING }])
    expect(await joinOuting({ shareToken: generateToken(), participantId: SLOT })).toEqual({ ok: false, code: 'outing_already_joined' })
  })
})

describe('bindOutingParticipant', () => {
  it('not signed in → outing_not_found', async () => {
    jar.set(`oc_${OUTING}`, generateToken())
    expect(await bindOutingParticipant({ outingId: OUTING })).toEqual({ ok: false, code: 'outing_not_found' })
  })

  it('binds the cookie slot to the account, clears the claim hash and the cookie', async () => {
    setMockUser({ id: ME })
    jar.set(`oc_${OUTING}`, generateToken())
    queueDbResult([outingRow()])
    queueDbResult([{ memberA: OTHER, memberB: PARTNER }])
    queueDbResult([])
    queueDbResult([{ id: SLOT, profileId: null }])
    queueDbResult([{ id: SLOT }])
    expect(await bindOutingParticipant({ outingId: OUTING })).toEqual({ ok: true, data: { participantId: SLOT } })
    expect(mockBuilder.set.mock.calls.at(-1)![0]).toEqual({ profileId: ME, claimTokenHash: null })
    expect(deleteCookie).toHaveBeenCalledWith(`oc_${OUTING}`)
  })
})

describe('releaseOutingSlot', () => {
  const asMember = () => {
    setMockUser({ id: ME })
    queueDbResult([outingRow()])
    queueDbResult([{ memberA: ME, memberB: PARTNER }])
    queueDbResult([])
  }
  it('refuses a slot bound to an account', async () => {
    asMember()
    queueDbResult([{ profileId: OTHER, claimTokenHash: null, claimedAt: new Date() }])
    expect(await releaseOutingSlot({ outingId: OUTING, participantId: SLOT })).toEqual({ ok: false, code: 'outing_slot_bound' })
  })
  it('refuses a deleted account\'s slot (claimed_at kept, no token)', async () => {
    asMember()
    queueDbResult([{ profileId: null, claimTokenHash: null, claimedAt: new Date() }])
    expect(await releaseOutingSlot({ outingId: OUTING, participantId: SLOT })).toEqual({ ok: false, code: 'outing_slot_bound' })
  })
  it('clears hash and claimed_at on a cookie-claimed slot', async () => {
    asMember()
    queueDbResult([{ profileId: null, claimTokenHash: 'h', claimedAt: new Date() }])
    queueDbResult([])
    expect(await releaseOutingSlot({ outingId: OUTING, participantId: SLOT })).toEqual({ ok: true, data: undefined })
    expect(mockBuilder.set.mock.calls.at(-1)![0]).toEqual({ claimTokenHash: null, claimedAt: null })
  })
})

describe('claim cookie lifetime', () => {
  it('one year while active, 30 days once ended', () => {
    expect(claimCookieOptions('active').maxAge).toBe(365 * 24 * 60 * 60)
    expect(claimCookieOptions('ended').maxAge).toBe(30 * 24 * 60 * 60)
  })
})

describe.each([['zh-TW', zhTW], ['zh-CN', zhCN], ['en', en], ['ja', ja]])('%s new outing error copy', (_l, t) => {
  it.each([
    'outing_admin_only', 'outing_viewing_past_chapter', 'outing_expense_not_found', 'outing_settlement_not_found',
    'outing_link_invalid', 'outing_slot_taken', 'outing_slot_bound', 'outing_already_joined',
  ] as const)('%s is a sentence without exclamation marks', (code) => {
    const msg = t.errors.actions[code]
    expect(msg.length).toBeGreaterThan(4)
    expect(msg).not.toMatch(/[!！]|管理|追蹤|监控|監控/)
  })
})
