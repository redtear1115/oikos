import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #1031 (behaviour layer) ───────────────────────────────
//
// `createInvite` used to take the group id from the caller and gate only on
// `requireViewer()` — JWT valid, no membership check anywhere on the path, and
// no compensating control (the pooled DB role bypasses RLS, and GroupInvites
// has no INSERT policy at all). A signed-in ex-partner could therefore mint an
// invite for the ledger they had left — they still hold its id, which ships in
// every dashboard RSC payload — accept it themselves once the ledger was back
// to solo, and walk back into the victim's books and encrypted PII.
//
// The fix resolves the group from the viewer instead. This test drives the
// action through the cast below so it still compiles once the parameter is
// gone: pre-fix the argument is honoured and the invite lands on the victim's
// group; post-fix it is inert and the invite can only ever land on the
// attacker's own.
//
// Compile-time half of the guard: `__tests__/createInvite.signature.test.ts`.
// ──────────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const envPath = resolve(__dirname, '../../.env.local')
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, 'utf-8')
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvLocal()

let mockUserId = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }) },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }))
// Analytics would try to reach PostHog; the funnel event is not under test.
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, groupInvites } =
  await import('@/lib/db/schema')
const inviteActions = await import('@/actions/invite')
const { createGroup } = await import('@/actions/group')
const { eq, inArray } = await import('drizzle-orm')

// Post-fix `createInvite()` takes no arguments. The cast lets the test pass one
// anyway, which is the whole point: it reproduces the attacker's call verbatim
// and asserts the argument no longer steers anything.
const createInviteWithGroupId = inviteActions.createInvite as unknown as (
  groupId: string,
) => Promise<string>

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

describe('createInvite — group comes from the viewer, never the caller (#1031)', () => {
  const ids = { attacker: '', victim: '', attackerGroup: '', victimGroup: '' }

  afterEach(async () => {
    try {
      const groups = [ids.attackerGroup, ids.victimGroup].filter(Boolean)
      if (groups.length) {
        await db.delete(groupInvites).where(inArray(groupInvites.groupId, groups))
        await db.delete(groupEpochs).where(inArray(groupEpochs.groupId, groups))
        await db.delete(groupBalance).where(inArray(groupBalance.groupId, groups))
        await db.delete(oikosGroups).where(inArray(oikosGroups.id, groups))
      }
      const people = [ids.attacker, ids.victim].filter(Boolean)
      if (people.length) await db.delete(profiles).where(inArray(profiles.id, people))
    } catch (e) {
      console.error('cleanup failed', e)
    }
  })

  it('mints for the viewer\'s own group and ignores a supplied foreign group id', async () => {
    ids.attacker = randomUUID()
    ids.victim = randomUUID()
    await db.insert(profiles).values([
      { id: ids.attacker, displayName: 'TEST_1031_attacker' },
      { id: ids.victim, displayName: 'TEST_1031_victim' },
    ])

    // The victim's solo ledger — the target. Modelled on the post-leaveGroup
    // state: memberA only, memberB null, so an accepted invite would slot the
    // attacker straight back in.
    const [victimGroup] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1031_victim_solo', memberA: ids.victim })
      .returning({ id: oikosGroups.id })
    ids.victimGroup = victimGroup.id
    await db.insert(groupBalance).values({ groupId: victimGroup.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: victimGroup.id, startedAt: new Date(), memberAId: ids.victim, memberBId: null,
    })

    // The attacker's own ledger, created after they left the victim's.
    const [attackerGroup] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1031_attacker_solo', memberA: ids.attacker })
      .returning({ id: oikosGroups.id })
    ids.attackerGroup = attackerGroup.id
    await db.insert(groupBalance).values({ groupId: attackerGroup.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: attackerGroup.id, startedAt: new Date(), memberAId: ids.attacker, memberBId: null,
    })

    mockUserId = ids.attacker
    await createInviteWithGroupId(victimGroup.id)

    // Nothing may be minted against the victim's ledger. Pre-fix this is
    // exactly where the invite landed.
    const onVictim = await db.select().from(groupInvites)
      .where(eq(groupInvites.groupId, victimGroup.id))
    expect(onVictim).toHaveLength(0)

    // …and the invite that WAS minted belongs to the attacker's own ledger.
    const onAttacker = await db.select().from(groupInvites)
      .where(eq(groupInvites.groupId, attackerGroup.id))
    expect(onAttacker).toHaveLength(1)
    expect(onAttacker[0].invitedBy).toBe(ids.attacker)
  })

  it('throws rather than minting when the viewer has no ledger of their own', async () => {
    ids.attacker = randomUUID()
    ids.victim = randomUUID()
    await db.insert(profiles).values([
      { id: ids.attacker, displayName: 'TEST_1031_groupless' },
      { id: ids.victim, displayName: 'TEST_1031_victim2' },
    ])

    const [victimGroup] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1031_victim_solo2', memberA: ids.victim })
      .returning({ id: oikosGroups.id })
    ids.victimGroup = victimGroup.id
    await db.insert(groupBalance).values({ groupId: victimGroup.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: victimGroup.id, startedAt: new Date(), memberAId: ids.victim, memberBId: null,
    })

    mockUserId = ids.attacker
    await expect(createInviteWithGroupId(victimGroup.id)).rejects.toThrow('找不到家計簿')

    const onVictim = await db.select().from(groupInvites)
      .where(eq(groupInvites.groupId, victimGroup.id))
    expect(onVictim).toHaveLength(0)
  })

  // SetupForm used to hand `createInvite` the id that `createGroup` had just
  // returned; now the second action re-resolves the group from the viewer. The
  // two are separate server-action round-trips against the same primary (one
  // pooled DATABASE_URL, no read replica), and `createGroup`'s insert commits
  // before it returns — so the read must see it. Pinned here rather than
  // argued, because getting it wrong breaks onboarding outright: no invite
  // link on the last step of setup.
  it('resolves the just-created group when setup mints an invite right after createGroup', async () => {
    ids.attacker = randomUUID()
    mockUserId = ids.attacker
    await db.insert(profiles).values([{ id: ids.attacker, displayName: 'TEST_1031_setup' }])

    const created = await createGroup('TEST_1031_setup_group')
    ids.attackerGroup = created.id

    const url = await inviteActions.createInvite()
    expect(url).toContain('/invite/')

    const minted = await db.select().from(groupInvites)
      .where(eq(groupInvites.groupId, created.id))
    expect(minted).toHaveLength(1)
    expect(minted[0].invitedBy).toBe(ids.attacker)
    expect(url).toContain(minted[0].token)
  })
})
