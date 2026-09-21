/**
 * #1287 S1 (b) — action-level AAD agreement.
 *
 * S1 still writes the legacy format, where the AAD is not bound, so a call
 * site that builds the wrong AAD (wrong column string, wrong pk) is invisible
 * until ENCRYPTION_WRITE_KID is set in S2 — and then it shows up only as
 * reveals of new rows throwing. These tests turn v1 writes on (write kid k1)
 * and prove, for every encrypted column, that what each create AND edit path
 * writes is what the matching reveal action decrypts, and that the pk bound
 * into the AAD is the pk written into the row.
 *
 * Mutation check: swapping any call site's column string or pk (e.g.
 * id_number_encrypted ↔ insurance_id_encrypted in createChild, or `asset.id`
 * → `group.id`) must turn at least one test here red.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  createCar, editCar, revealCarPlate,
  createChild, editChild, revealChildPii, revealChildName,
  createHouse, editHouse, revealHouseAddress,
} from '@/actions/asset'
import { createInvoiceCredential, refreshInvoiceCredential } from '@/actions/invoice'
import { decrypt, aadFor, CryptoError } from '@/lib/crypto'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家', guardianBetaEnabled: true }
// A7 — the row later belongs to another group (member left). No group in the AAD.
const OTHER_GROUP = { id: 'grp-2', memberA: 'user-a', memberB: null, name: '新家', guardianBetaEnabled: true }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const V1_K1_RE = /^v1:k1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
  vi.stubEnv('ENCRYPTION_WRITE_KID', 'k1')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const valuesCall = (i: number) => mockBuilder.values.mock.calls[i][0] as Record<string, unknown>
const setCalls = () => mockBuilder.set.mock.calls.map((c) => c[0] as Record<string, unknown>)
const conflictSet = () =>
  (mockBuilder.onConflictDoUpdate.mock.calls[0][0] as { set: Record<string, unknown> }).set

function findSet(key: string): string {
  const hit = setCalls().find((s) => typeof s[key] === 'string')
  if (!hit) throw new Error(`no .set() call carried ${key}`)
  return hit[key] as string
}

// ── CarDetails.plate_encrypted ────────────────────────────────────────────────

describe('AAD agreement — CarDetails.plate_encrypted', () => {
  async function reveal(assetId: string, ct: string, group: { id: string; memberA: string; memberB: string | null } = GROUP) {
    queueDbResult([group])
    queueDbResult([{ assetType: 'car', assetDeletedAt: null, plateEncrypted: ct }])
    return revealCarPlate(assetId)
  }

  it('createCar → revealCarPlate', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'car-1' }])
    queueDbResult([])
    await createCar({ name: '車', plate: 'ABC-1234' })

    const row = valuesCall(1)
    expect(row.assetId).toBe('car-1')
    expect(row.plateEncrypted).toMatch(V1_K1_RE)
    expect(await reveal(row.assetId as string, row.plateEncrypted as string)).toEqual({ ok: true, data: 'ABC-1234' })
    // bound to this row only
    await expect(reveal('car-2', row.plateEncrypted as string)).rejects.toThrow(CryptoError)
    // A7 — same pk after a group move still reveals
    expect(await reveal('car-1', row.plateEncrypted as string, OTHER_GROUP)).toEqual({ ok: true, data: 'ABC-1234' })
  })

  it('editCar → revealCarPlate', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'car-1' }])
    queueDbResult([])
    await editCar({ id: 'car-1', name: '車', plate: 'XYZ-9', purchasedAt: null, purchasePrice: null })

    const ct = findSet('plateEncrypted')
    expect(ct).toMatch(V1_K1_RE)
    expect(await reveal('car-1', ct)).toEqual({ ok: true, data: 'XYZ-9' })
  })
})

// ── Assets.name_encrypted (child full name) ──────────────────────────────────

describe('AAD agreement — Assets.name_encrypted', () => {
  async function reveal(assetId: string, ct: string) {
    queueDbResult([GROUP])
    queueDbResult([{ assetType: 'child', assetDeletedAt: null, nameEncrypted: ct }])
    return revealChildName(assetId)
  }

  it('createChild generates Assets.id in the app and binds that same id into the AAD', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'ignored-returning-id' }])
    queueDbResult([])
    await createChild({ name: '小白', fullName: '陳小白' })

    const assetRow = valuesCall(0)
    expect(assetRow.id).toMatch(UUID_RE)
    expect(assetRow.nameEncrypted).toMatch(V1_K1_RE)
    // The id passed to .values() is the pk in the AAD …
    expect(decrypt(assetRow.nameEncrypted as string, aadFor('Assets', 'name_encrypted', assetRow.id as string))).toBe('陳小白')
    // … and the reveal action (looked up by that id) agrees.
    expect(await reveal(assetRow.id as string, assetRow.nameEncrypted as string)).toEqual({ ok: true, data: '陳小白' })
    await expect(reveal('ignored-returning-id', assetRow.nameEncrypted as string)).rejects.toThrow(CryptoError)
  })

  it('createChild generates a fresh id per call', async () => {
    for (let i = 0; i < 2; i++) {
      queueDbResult([GROUP])
      queueDbResult([{ id: `a-${i}` }])
      queueDbResult([])
      await createChild({ name: '小白' })
    }
    expect(valuesCall(0).id).not.toBe(valuesCall(2).id)
  })

  it('editChild → revealChildName', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'child-1' }])
    queueDbResult([])
    await editChild({ id: 'child-1', name: '小白', fullName: '陳小白' })

    const ct = findSet('nameEncrypted')
    expect(ct).toMatch(V1_K1_RE)
    expect(await reveal('child-1', ct)).toEqual({ ok: true, data: '陳小白' })
  })

  it('editChild refuses a non-canonical id (it would bind an AAD the reveal cannot rebuild)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'child-1' }]) // Postgres matched the uuid case-insensitively
    expect(await editChild({ id: 'CHILD-1', name: '小白', fullName: '陳小白' }))
      .toEqual({ ok: false, code: 'aibutsu_not_found' })
    expect(mockBuilder.onConflictDoUpdate).not.toHaveBeenCalled()
  })
})

// ── ChildDetails.id_number_encrypted / insurance_id_encrypted ────────────────

describe('AAD agreement — ChildDetails PII', () => {
  async function reveal(assetId: string, field: 'nationalId' | 'nhiNo', row: { id?: unknown; ins?: unknown }) {
    queueDbResult([GROUP])
    queueDbResult([{
      assetType: 'child',
      assetDeletedAt: null,
      idNumberEncrypted: row.id ?? null,
      insuranceIdEncrypted: row.ins ?? null,
    }])
    return revealChildPii(assetId, field)
  }

  it('createChild → revealChildPii (both columns)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'child-7' }])
    queueDbResult([])
    await createChild({ name: '小白', nationalId: 'A123456789', nhiNo: 'NHI-001' })

    const row = valuesCall(1)
    expect(row.assetId).toBe('child-7')
    expect(row.idNumberEncrypted).toMatch(V1_K1_RE)
    expect(row.insuranceIdEncrypted).toMatch(V1_K1_RE)
    const cts = { id: row.idNumberEncrypted, ins: row.insuranceIdEncrypted }
    expect(await reveal('child-7', 'nationalId', cts)).toEqual({ ok: true, data: 'A123456789' })
    expect(await reveal('child-7', 'nhiNo', cts)).toEqual({ ok: true, data: 'NHI-001' })
    // swapped columns must not reveal
    const swapped = { id: row.insuranceIdEncrypted, ins: row.idNumberEncrypted }
    await expect(reveal('child-7', 'nationalId', swapped)).rejects.toThrow(CryptoError)
    await expect(reveal('child-7', 'nhiNo', swapped)).rejects.toThrow(CryptoError)
  })

  it('editChild (upsert SET path) → revealChildPii', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'child-1' }])
    queueDbResult([])
    await editChild({ id: 'child-1', name: '小白', nationalId: 'B223456789', nhiNo: 'NHI-002' })

    const set = conflictSet()
    const cts = { id: set.idNumberEncrypted, ins: set.insuranceIdEncrypted }
    expect(cts.id).toMatch(V1_K1_RE)
    expect(await reveal('child-1', 'nationalId', cts)).toEqual({ ok: true, data: 'B223456789' })
    expect(await reveal('child-1', 'nhiNo', cts)).toEqual({ ok: true, data: 'NHI-002' })
  })

  it('editChild (upsert INSERT path, no ChildDetails row yet) → revealChildPii', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'child-1' }])
    queueDbResult([])
    await editChild({ id: 'child-1', name: '小白', nationalId: 'C323456789', nhiNo: 'NHI-003' })

    const row = valuesCall(0)
    expect(row.assetId).toBe('child-1')
    const cts = { id: row.idNumberEncrypted, ins: row.insuranceIdEncrypted }
    expect(await reveal('child-1', 'nationalId', cts)).toEqual({ ok: true, data: 'C323456789' })
    expect(await reveal('child-1', 'nhiNo', cts)).toEqual({ ok: true, data: 'NHI-003' })
  })
})

// ── HouseDetails.address_encrypted ────────────────────────────────────────────

describe('AAD agreement — HouseDetails.address_encrypted', () => {
  async function reveal(assetId: string, ct: string) {
    queueDbResult([GROUP])
    queueDbResult([{ assetType: 'house', assetDeletedAt: null, addressEncrypted: ct }])
    return revealHouseAddress(assetId)
  }

  it('createHouse → revealHouseAddress', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'house-1' }])
    queueDbResult([])
    await createHouse({ name: '家', address: '台北市大安區某路1號' })

    const row = valuesCall(1)
    expect(row.assetId).toBe('house-1')
    expect(row.addressEncrypted).toMatch(V1_K1_RE)
    expect(await reveal('house-1', row.addressEncrypted as string)).toEqual({ ok: true, data: '台北市大安區某路1號' })
    await expect(reveal('house-2', row.addressEncrypted as string)).rejects.toThrow(CryptoError)
  })

  it('editHouse → revealHouseAddress', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'house-1' }])
    queueDbResult([])
    await editHouse({ id: 'house-1', name: '家', address: '新北市板橋區某路2號' })

    const ct = findSet('addressEncrypted')
    expect(ct).toMatch(V1_K1_RE)
    expect(await reveal('house-1', ct)).toEqual({ ok: true, data: '新北市板橋區某路2號' })
  })
})

// ── InvoiceCredentials.verification_code_encrypted (write-only) ──────────────

describe('AAD agreement — InvoiceCredentials.verification_code_encrypted', () => {
  it('createInvoiceCredential generates the id in the app and binds that same id into the AAD', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    queueDbResult([{ id: 'returned' }])
    await createInvoiceCredential({ barcode: '/AB12CD3', verificationCode: 'A1B2C3D4', nickname: null })

    const row = valuesCall(0)
    expect(row.id).toMatch(UUID_RE)
    expect(row.verificationCodeEncrypted).toMatch(V1_K1_RE)
    const ct = row.verificationCodeEncrypted as string
    expect(decrypt(ct, aadFor('InvoiceCredentials', 'verification_code_encrypted', row.id as string))).toBe('A1B2C3D4')
    expect(() => decrypt(ct, aadFor('InvoiceCredentials', 'verification_code_encrypted', 'returned'))).toThrow(CryptoError)
  })

  it('refreshInvoiceCredential binds the NEW row id (never the soft-deleted one)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'cred-1', barcode: '/AB12CD3', nickname: null, lastSyncedAt: null }])
    queueDbResult([{ id: 'cred-1' }])
    queueDbResult([{ id: 'returned' }])
    await refreshInvoiceCredential('cred-1', 'NEWCODEZ')

    const row = valuesCall(0)
    expect(row.id).toMatch(UUID_RE)
    expect(row.id).not.toBe('cred-1')
    const ct = row.verificationCodeEncrypted as string
    expect(ct).toMatch(V1_K1_RE)
    expect(decrypt(ct, aadFor('InvoiceCredentials', 'verification_code_encrypted', row.id as string))).toBe('NEWCODEZ')
    expect(() => decrypt(ct, aadFor('InvoiceCredentials', 'verification_code_encrypted', 'cred-1'))).toThrow(CryptoError)
  })
})

// ── S1 default: writes stay legacy ────────────────────────────────────────────

describe('S1 default — no ENCRYPTION_WRITE_KID', () => {
  it('create paths still write the legacy format and reveal it', async () => {
    vi.stubEnv('ENCRYPTION_WRITE_KID', '')
    queueDbResult([GROUP])
    queueDbResult([{ id: 'car-1' }])
    queueDbResult([])
    await createCar({ name: '車', plate: 'ABC-1234' })
    const ct = valuesCall(1).plateEncrypted as string
    expect(ct).toMatch(/^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)

    queueDbResult([GROUP])
    queueDbResult([{ assetType: 'car', assetDeletedAt: null, plateEncrypted: ct }])
    expect(await revealCarPlate('car-1')).toEqual({ ok: true, data: 'ABC-1234' })
  })
})
