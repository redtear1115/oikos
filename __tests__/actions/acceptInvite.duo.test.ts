import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Regression for #912: a user already in a DUO group must be server-blocked
// from accepting an invite to another group (no double-membership).

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

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupInvites } = await import('@/lib/db/schema')
const { acceptInvite } = await import('@/actions/invite')
const { eq, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

describe('acceptInvite — accepter already in a duo (#912)', () => {
  const ids = { accepter: '', partner: '', inviter: '', myDuo: '', target: '', token: '' }

  afterEach(async () => {
    try {
      if (ids.token) await db.delete(groupInvites).where(eq(groupInvites.token, ids.token))
      for (const gid of [ids.myDuo, ids.target]) {
        if (!gid) continue
        await db.delete(groupBalance).where(eq(groupBalance.groupId, gid))
        await db.delete(oikosGroups).where(eq(oikosGroups.id, gid))
      }
      const people = [ids.accepter, ids.partner, ids.inviter].filter(Boolean)
      if (people.length) await db.delete(profiles).where(inArray(profiles.id, people))
    } catch (e) {
      console.error('cleanup failed', e)
    }
  })

  it('rejects with already_in_duo and does not join the target group', async () => {
    ids.accepter = randomUUID()
    ids.partner = randomUUID()
    ids.inviter = randomUUID()
    await db.insert(profiles).values([
      { id: ids.accepter, displayName: 'TEST_912_accepter' },
      { id: ids.partner, displayName: 'TEST_912_partner' },
      { id: ids.inviter, displayName: 'TEST_912_inviter' },
    ])

    const [myDuo] = await db.insert(oikosGroups)
      .values({ name: 'TEST_912_myDuo', memberA: ids.accepter, memberB: ids.partner })
      .returning({ id: oikosGroups.id })
    ids.myDuo = myDuo.id
    await db.insert(groupBalance).values({ groupId: myDuo.id, balance: 0, version: 0 })

    const [target] = await db.insert(oikosGroups)
      .values({ name: 'TEST_912_target', memberA: ids.inviter })
      .returning({ id: oikosGroups.id })
    ids.target = target.id
    await db.insert(groupBalance).values({ groupId: target.id, balance: 0, version: 0 })

    ids.token = 'TEST_912_' + randomUUID()
    await db.insert(groupInvites).values({
      groupId: target.id,
      invitedBy: ids.inviter,
      token: ids.token,
      expiresAt: new Date(Date.now() + 86_400_000),
    })

    mockUserId = ids.accepter
    await expect(acceptInvite(ids.token)).rejects.toThrow('already_in_duo')

    const [after] = await db.select().from(oikosGroups).where(eq(oikosGroups.id, target.id)).limit(1)
    expect(after.memberB).toBeNull()
  })
})
