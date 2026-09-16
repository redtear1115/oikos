import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Regression for #1032 ─────────────────────────────────────────────────
//
// `editFuelLog` looked the existing row up by id alone, with no group
// constraint, and its only ownership check validated the assetId the CALLER
// passed in rather than the row being edited. Holding another group's
// fuelLogId was therefore enough to (a) overwrite the victim's fuel log,
// (b) soft-delete the victim's linked CashTransaction, and (c) insert a
// replacement txn into the attacker's own group still carrying the victim's
// fuelLogId — a cross-group FK, plus a stale GroupBalance on the victim's
// side, since only the attacker's balance is recalculated.
//
// The sibling functions `softDeleteFuelLog` and `getFuelLogById` already
// resolved `existingLog.assetId` against `assets.groupId = group.id`; this was
// an omission, not a design. The test pins the omission shut.
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
// `getViewerWriteContext` → `resolveViewerEpochContext` reads PAST_EPOCH_COOKIE;
// outside a Next request scope `cookies()` throws. Empty jar = viewer is on the
// current chapter, which is what these fixtures model.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}))
vi.mock('@/lib/analytics/server', () => ({
  captureServer: async () => {},
  isUserFirstNonDeletedRecord: async () => false,
}))

const { db } = await import('@/lib/db/client')
const {
  profiles, oikosGroups, groupBalance, groupEpochs,
  assets, carDetails, fuelLogs, cashTransactions,
} = await import('@/lib/db/schema')
const { editFuelLog } = await import('@/actions/fuelLog')
const { eq, inArray } = await import('drizzle-orm')

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set; cannot run integration test. Ensure .env.local has DATABASE_URL.')
  }
})

describe('editFuelLog — the edited row must belong to the viewer (#1032)', () => {
  const ids = {
    attacker: '', victim: '',
    attackerGroup: '', victimGroup: '',
    attackerCar: '', victimCar: '',
    victimFuelLog: '', victimTxn: '',
  }

  afterEach(async () => {
    try {
      const groups = [ids.attackerGroup, ids.victimGroup].filter(Boolean)
      const carIds = [ids.attackerCar, ids.victimCar].filter(Boolean)
      if (groups.length) {
        await db.delete(cashTransactions).where(inArray(cashTransactions.groupId, groups))
      }
      if (carIds.length) {
        await db.delete(fuelLogs).where(inArray(fuelLogs.assetId, carIds))
        await db.delete(carDetails).where(inArray(carDetails.assetId, carIds))
        await db.delete(assets).where(inArray(assets.id, carIds))
      }
      if (groups.length) {
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

  it('throws on a fuelLogId belonging to another group, and writes nothing', async () => {
    ids.attacker = randomUUID()
    ids.victim = randomUUID()
    await db.insert(profiles).values([
      { id: ids.attacker, displayName: 'TEST_1032_attacker' },
      { id: ids.victim, displayName: 'TEST_1032_victim' },
    ])

    // ── victim's ledger: one car, one fuel log, one linked CashTransaction ──
    const [victimGroup] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1032_victim', memberA: ids.victim })
      .returning({ id: oikosGroups.id })
    ids.victimGroup = victimGroup.id
    await db.insert(groupBalance).values({ groupId: victimGroup.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: victimGroup.id, startedAt: new Date(), memberAId: ids.victim, memberBId: null,
    })

    const [victimCar] = await db.insert(assets)
      .values({ groupId: victimGroup.id, type: 'car', name: 'TEST_1032_victim_car' })
      .returning({ id: assets.id })
    ids.victimCar = victimCar.id
    await db.insert(carDetails).values({ assetId: victimCar.id, fuelType: '95' })

    const loggedAt = new Date('2026-01-15T10:00:00Z')
    const [victimLog] = await db.insert(fuelLogs).values({
      assetId: victimCar.id,
      liters: '40.00',
      fuelType: '95',
      odometer: 12000,
      station: 'TEST_1032_victim_station',
      loggedAt,
    }).returning({ id: fuelLogs.id })
    ids.victimFuelLog = victimLog.id

    const [victimTxn] = await db.insert(cashTransactions).values({
      groupId: victimGroup.id,
      assetId: victimCar.id,
      fuelLogId: victimLog.id,
      paidBy: ids.victim,
      amount: 1600,
      splitType: 'all_mine',
      category: 'transit',
      description: '加油 · TEST_1032_victim_station',
      transactedAt: loggedAt,
    }).returning({ id: cashTransactions.id })
    ids.victimTxn = victimTxn.id

    // ── attacker's own ledger, with a car of their own to name in the input ──
    const [attackerGroup] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1032_attacker', memberA: ids.attacker })
      .returning({ id: oikosGroups.id })
    ids.attackerGroup = attackerGroup.id
    await db.insert(groupBalance).values({ groupId: attackerGroup.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: attackerGroup.id, startedAt: new Date(), memberAId: ids.attacker, memberBId: null,
    })

    const [attackerCar] = await db.insert(assets)
      .values({ groupId: attackerGroup.id, type: 'car', name: 'TEST_1032_attacker_car' })
      .returning({ id: assets.id })
    ids.attackerCar = attackerCar.id
    await db.insert(carDetails).values({ assetId: attackerCar.id, fuelType: '95' })

    // ── the attack: victim's fuelLogId, attacker's own (valid) assetId ──
    mockUserId = ids.attacker
    expect(await editFuelLog({
      id: victimLog.id,
      assetId: attackerCar.id,
      liters: 1,
      fuelType: '95',
      odometer: 999999,
      cost: 1,
      paidBy: ids.attacker,
      splitType: 'all_mine',
      station: 'TEST_1032_pwned',
      loggedAt: '2026-02-01',
    })).toEqual({ ok: false, code: 'linked_asset_not_in_group' })

    // The victim's fuel log is untouched.
    const [logAfter] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, victimLog.id)).limit(1)
    expect(logAfter.station).toBe('TEST_1032_victim_station')
    expect(logAfter.odometer).toBe(12000)
    expect(Number(logAfter.liters)).toBe(40)
    expect(logAfter.assetId).toBe(victimCar.id)

    // The victim's linked transaction is still live — not soft-deleted.
    const [txnAfter] = await db.select().from(cashTransactions)
      .where(eq(cashTransactions.id, victimTxn.id)).limit(1)
    expect(txnAfter.deletedAt).toBeNull()
    expect(txnAfter.amount).toBe(1600)

    // No replacement txn was planted in the attacker's group carrying the
    // victim's fuelLogId.
    const attackerTxns = await db.select().from(cashTransactions)
      .where(eq(cashTransactions.groupId, attackerGroup.id))
    expect(attackerTxns).toHaveLength(0)
  })

  it('still lets the owning group edit its own fuel log', async () => {
    ids.victim = randomUUID()
    await db.insert(profiles).values([{ id: ids.victim, displayName: 'TEST_1032_owner' }])

    const [group] = await db.insert(oikosGroups)
      .values({ name: 'TEST_1032_owner_group', memberA: ids.victim })
      .returning({ id: oikosGroups.id })
    ids.victimGroup = group.id
    await db.insert(groupBalance).values({ groupId: group.id, balance: 0, version: 0 })
    await db.insert(groupEpochs).values({
      groupId: group.id, startedAt: new Date(), memberAId: ids.victim, memberBId: null,
    })

    const [car] = await db.insert(assets)
      .values({ groupId: group.id, type: 'car', name: 'TEST_1032_owner_car' })
      .returning({ id: assets.id })
    ids.victimCar = car.id
    await db.insert(carDetails).values({ assetId: car.id, fuelType: '95' })

    const loggedAt = new Date('2026-01-15T10:00:00Z')
    const [log] = await db.insert(fuelLogs).values({
      assetId: car.id, liters: '40.00', fuelType: '95', odometer: 12000,
      station: 'before', loggedAt,
    }).returning({ id: fuelLogs.id })
    ids.victimFuelLog = log.id

    await db.insert(cashTransactions).values({
      groupId: group.id, assetId: car.id, fuelLogId: log.id, paidBy: ids.victim,
      amount: 1600, splitType: 'all_mine', category: 'transit',
      description: '加油 · before', transactedAt: loggedAt,
    })

    mockUserId = ids.victim
    await editFuelLog({
      id: log.id,
      assetId: car.id,
      liters: 42,
      fuelType: '95',
      odometer: 12500,
      cost: 1700,
      paidBy: ids.victim,
      splitType: 'all_mine',
      station: 'after',
      loggedAt: '2026-01-20',
    })

    const [after] = await db.select().from(fuelLogs).where(eq(fuelLogs.id, log.id)).limit(1)
    expect(after.station).toBe('after')
    expect(after.odometer).toBe(12500)
  })
})
