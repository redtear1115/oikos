import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1579 — a policy whose 要保人 / member 被保人 left the ledger ─────────
//
// A and B shared a ledger; B left, so the group row is A alone, but A's policy
// still stores B as policy holder and as insured member.
//
//   read:  the page's details read (getInsuranceDetailsForViewer) must not
//          return B's profile id or B's current display name.
//   write: editInsurance keeps refusing B's id (policyholder_not_member /
//          insured_not_member), refuses a NULL holder over the stored one
//          (policyholder_required), and accepts a current member.
//
// Failure looks like: the detail page's RSC payload carries B's uuid and
// current name; or an edit of the premium silently erases the stored holder.
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
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const { profiles, oikosGroups, groupBalance, groupEpochs, assets, insuranceDetails } = await import('@/lib/db/schema')
const { editInsurance } = await import('@/actions/asset')
const { getInsuranceDetailsForViewer, loadMemberLinkScope } = await import('@/lib/db/queries/insuranceView')
const { eq, inArray } = await import('drizzle-orm')

const T = 'TEST_1579'
const EX_NAME = `${T}_B_current_name`
const ids = { A: randomUUID(), B: randomUUID(), group: '', epoch: '', policy: '' }

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
  await db.insert(profiles).values([
    { id: ids.A, displayName: `${T}_A` },
    { id: ids.B, displayName: EX_NAME },
  ])
  // B has left: the group row names A alone.
  const [g] = await db.insert(oikosGroups)
    .values({ name: `${T}_ledger`, memberA: ids.A, memberB: null, guardianBetaEnabled: true })
    .returning({ id: oikosGroups.id })
  ids.group = g.id
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  const [e] = await db.insert(groupEpochs)
    .values({ groupId: g.id, startedAt: new Date(), memberAId: ids.A, memberBId: null })
    .returning({ id: groupEpochs.id })
  ids.epoch = e.id
  const [a] = await db.insert(assets)
    .values({ groupId: g.id, type: 'insurance', name: `${T} policy` })
    .returning({ id: assets.id })
  ids.policy = a.id
  await db.insert(insuranceDetails).values({
    assetId: a.id, insuredType: 'user', insuredUserId: ids.B, policyHolderUserId: ids.B,
    insuranceType: 'medical', annualPremium: 12000,
  })
})

afterAll(async () => {
  try {
    if (ids.policy) {
      await db.delete(insuranceDetails).where(eq(insuranceDetails.assetId, ids.policy))
      await db.delete(assets).where(eq(assets.id, ids.policy))
    }
    if (ids.group) {
      await db.delete(groupEpochs).where(eq(groupEpochs.groupId, ids.group))
      await db.delete(groupBalance).where(eq(groupBalance.groupId, ids.group))
      await db.delete(oikosGroups).where(eq(oikosGroups.id, ids.group))
    }
    await db.delete(profiles).where(inArray(profiles.id, [ids.A, ids.B]))
  } catch (err) {
    console.error('cleanup failed', err)
  }
})

const stored = async () => {
  const [r] = await db
    .select({ holder: insuranceDetails.policyHolderUserId, insured: insuranceDetails.insuredUserId, premium: insuranceDetails.annualPremium })
    .from(insuranceDetails)
    .where(eq(insuranceDetails.assetId, ids.policy))
  return r
}

describe('policy whose holder and insured member left (#1579)', () => {
  it("the page read carries neither B's id nor B's current name", async () => {
    const context = {
      group: { memberA: ids.A, memberB: null },
      window: { startedAt: new Date(0), endedAt: null, epochId: ids.epoch, isPast: false },
    }
    const scope = await loadMemberLinkScope(context, ids.A)
    const view = await getInsuranceDetailsForViewer(ids.policy, ids.group, ids.A, scope)
    expect(view).not.toBeNull()
    const wire = JSON.stringify(view)
    expect(wire).not.toContain(ids.B)
    expect(wire).not.toContain(EX_NAME)
    expect(view).toMatchObject({ policyHolderIsFormer: true, insuredIsFormer: true, formerLabel: true })
  })

  it("editInsurance refuses B's id as 要保人 and leaves the row as it was", async () => {
    mockUserId = ids.A
    const r = await editInsurance({ id: ids.policy, name: `${T} policy`, policyHolderUserId: ids.B, annualPremium: 9000 })
    expect(r).toEqual({ ok: false, code: 'policyholder_not_member' })
    expect(await stored()).toEqual({ holder: ids.B, insured: ids.B, premium: 12000 })
  })

  it("editInsurance refuses B's id as 被保人", async () => {
    mockUserId = ids.A
    const r = await editInsurance({ id: ids.policy, name: `${T} policy`, policyHolderUserId: ids.A, insuredUserId: ids.B })
    expect(r).toEqual({ ok: false, code: 'insured_not_member' })
    expect((await stored()).holder).toBe(ids.B)
  })

  it('editInsurance refuses a NULL 要保人 over the stored one (no silent erase)', async () => {
    mockUserId = ids.A
    const r = await editInsurance({ id: ids.policy, name: `${T} policy`, policyHolderUserId: null, insuredUserId: ids.A, annualPremium: 9000 })
    expect(r).toEqual({ ok: false, code: 'policyholder_required' })
    expect(await stored()).toEqual({ holder: ids.B, insured: ids.B, premium: 12000 })
  })

  it('editInsurance accepts a current member for both', async () => {
    mockUserId = ids.A
    const r = await editInsurance({ id: ids.policy, name: `${T} policy`, policyHolderUserId: ids.A, insuredUserId: ids.A, annualPremium: 9000 })
    expect(r).toEqual({ ok: true, data: undefined })
    expect(await stored()).toEqual({ holder: ids.A, insured: ids.A, premium: 9000 })
  })
})
