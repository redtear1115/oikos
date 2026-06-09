import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #911 ──────────────────────────────────────────────────
//
// createGroup used to `throw new Error('Already in a group')` when the viewer
// already had an active group. That raw throw surfaced as an unhandled Server
// Action 500 (Sentry noise) and showed the user a raw English string. The
// guards around it (/setup redirect, confirm button disabled) close the
// common cases, but a cross-tab / network-retry race can still re-enter
// createGroup for a user who already has a group.
//
// Desired behaviour: createGroup is idempotent — if the viewer already has an
// active group, it returns that existing group (no throw, no second group).
//
// Touches the real dev DB (mirrors the other __tests__/actions suites) so the
// getActiveGroupForUser guard runs against actual rows.
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

let mockUserId: string = ''
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: mockUserId } }, error: null }),
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance } = await import('@/lib/db/schema')
const { createGroup } = await import('@/actions/group')
const { eq } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.',
    )
  }
})

describe('createGroup — idempotent when viewer already has a group (#911)', () => {
  let userId: string | null = null

  afterEach(async () => {
    if (!userId) return
    try {
      const groups = await db
        .select({ id: oikosGroups.id })
        .from(oikosGroups)
        .where(eq(oikosGroups.memberA, userId))
      for (const g of groups) {
        await db.delete(groupBalance).where(eq(groupBalance.groupId, g.id))
        await db.delete(oikosGroups).where(eq(oikosGroups.id, g.id))
      }
      await db.delete(profiles).where(eq(profiles.id, userId))
    } catch (e) {
      console.error('cleanup failed', e)
    }
    userId = null
  })

  it('returns the existing group instead of throwing, and creates no second group', async () => {
    const uid = randomUUID()
    userId = uid
    await db.insert(profiles).values({ id: uid, displayName: 'TEST_911_user' })

    const [existing] = await db
      .insert(oikosGroups)
      .values({ name: 'TEST_911_existing', memberA: uid })
      .returning({ id: oikosGroups.id })
    await db.insert(groupBalance).values({ groupId: existing.id, balance: 0, version: 0 })

    // ── Act: a second createGroup for the already-grouped user ──
    mockUserId = uid
    const result = await createGroup('TEST_911_second_attempt')

    // ── Assert: returned the SAME group, did not throw ──
    expect(result.id).toBe(existing.id)

    // ── Assert: no second group was created ──
    const groups = await db
      .select({ id: oikosGroups.id })
      .from(oikosGroups)
      .where(eq(oikosGroups.memberA, uid))
    expect(groups).toHaveLength(1)
  })
})
