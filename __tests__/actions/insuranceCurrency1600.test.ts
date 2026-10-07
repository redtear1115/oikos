import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── #1600 — each policy records its own currency ─────────────────────────
// Ledger base is USD. create without a currency stores the ledger's; create with
// one stores it; an invalid code is rejected and writes nothing; edit without a
// currency keeps the stored one (never NULL, never reset to the ledger's); edit
// with one changes it; a policy with no details row yet gets the ledger's.
//
// Failure looks like: a JPY policy comes back as the ledger's USD after an
// unrelated edit, or an old NULL row is NULLed again and the page guesses.
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
const { editInsurance, createInsurance } = await import('@/actions/asset')
const { eq, inArray } = await import('drizzle-orm')

const T = 'TEST_1600'
const ids = { A: randomUUID(), group: '' }
const created: string[] = []

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
  await db.insert(profiles).values([{ id: ids.A, displayName: `${T}_A` }])
  const [g] = await db.insert(oikosGroups)
    .values({ name: `${T}_ledger`, memberA: ids.A, memberB: null, guardianBetaEnabled: true, baseCurrency: 'usd' })
    .returning({ id: oikosGroups.id })
  ids.group = g.id
  await db.insert(groupBalance).values({ groupId: g.id, balance: 0, version: 0 })
  const [e] = await db.insert(groupEpochs)
    .values({ groupId: g.id, startedAt: new Date(), memberAId: ids.A, memberBId: null })
    .returning({ id: groupEpochs.id })
  void e
  mockUserId = ids.A
})

afterAll(async () => {
  try {
    if (created.length) {
      await db.delete(insuranceDetails).where(inArray(insuranceDetails.assetId, created))
      await db.delete(assets).where(inArray(assets.id, created))
    }
    if (ids.group) {
      await db.delete(groupEpochs).where(eq(groupEpochs.groupId, ids.group))
      await db.delete(groupBalance).where(eq(groupBalance.groupId, ids.group))
      await db.delete(oikosGroups).where(eq(oikosGroups.id, ids.group))
    }
    await db.delete(profiles).where(eq(profiles.id, ids.A))
  } catch (err) {
    console.error('cleanup failed', err)
  }
})

const currencyOf = async (id: string) => {
  const [r] = await db.select({ c: insuranceDetails.currency }).from(insuranceDetails).where(eq(insuranceDetails.assetId, id))
  return r?.c
}
const make = async (extra: { currency?: string | null } = {}) => {
  const r = await createInsurance({ name: `${T} policy`, kind: 'medical', annualPremium: 1200, ...extra })
  if (!('ok' in r) || r.ok) {
    const id = (r as { ok: true; data: { id: string } }).data.id
    created.push(id)
    return id
  }
  throw new Error(JSON.stringify(r))
}

describe('InsuranceDetails.currency (#1600)', () => {
  it("create without a currency stores the ledger's (usd)", async () => {
    expect(await currencyOf(await make())).toBe('usd')
  })

  it('create with a currency stores it (jpy in a usd ledger)', async () => {
    expect(await currencyOf(await make({ currency: 'jpy' }))).toBe('jpy')
  })

  it('an invalid currency is rejected and writes no row', async () => {
    const before = await db.select({ id: assets.id }).from(assets).where(eq(assets.groupId, ids.group))
    await expect(createInsurance({ name: `${T} bad`, currency: 'eur' })).rejects.toThrow()
    const after = await db.select({ id: assets.id }).from(assets).where(eq(assets.groupId, ids.group))
    expect(after.length).toBe(before.length)
  })

  it('edit without a currency keeps the stored one (jpy stays jpy in a usd ledger)', async () => {
    const id = await make({ currency: 'jpy' })
    const r = await editInsurance({ id, name: `${T} renamed`, kind: 'medical', annualPremium: 2400 })
    expect(r).toEqual({ ok: true, data: undefined })
    expect(await currencyOf(id)).toBe('jpy')
  })

  it('edit sending the stored currency back (the sheet does) keeps it', async () => {
    const id = await make({ currency: 'twd' })
    await editInsurance({ id, name: `${T} renamed again`, kind: 'medical', currency: 'twd' })
    expect(await currencyOf(id)).toBe('twd')
  })

  it('edit with a currency changes it', async () => {
    const id = await make({ currency: 'jpy' })
    await editInsurance({ id, name: `${T} policy`, kind: 'medical', currency: 'cny' })
    expect(await currencyOf(id)).toBe('cny')
  })

  it("edit on an asset with no details row writes the ledger's currency", async () => {
    const [a] = await db.insert(assets).values({ groupId: ids.group, type: 'insurance', name: `${T} bare` }).returning({ id: assets.id })
    created.push(a.id)
    expect(await currencyOf(a.id)).toBeUndefined()
    await editInsurance({ id: a.id, name: `${T} bare`, kind: 'medical' })
    expect(await currencyOf(a.id)).toBe('usd')
  })

  it('a NULL-currency row (old code / pre-0085) stays NULL on an edit without a currency', async () => {
    const id = await make()
    await db.update(insuranceDetails).set({ currency: null }).where(eq(insuranceDetails.assetId, id))
    await editInsurance({ id, name: `${T} policy`, kind: 'medical', annualPremium: 5 })
    expect(await currencyOf(id)).toBeNull()
  })

  it('the page read returns the stored currency', async () => {
    const { getInsuranceDetails } = await import('@/lib/db/queries/aibutsu')
    const id = await make({ currency: 'jpy' })
    expect((await getInsuranceDetails(id, ids.group, ids.A))?.currency).toBe('jpy')
  })
})
