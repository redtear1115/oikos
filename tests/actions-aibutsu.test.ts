import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  createChild, editChild, revealChildPii,
  createPet, editPet,
  createPlant, editPlant,
  createInsurance, editInsurance,
  createHouse, editHouse,
} from '@/actions/asset'
import { decrypt } from '@/lib/crypto'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家', guardianBetaEnabled: true }
const GROUP_GUARDIAN_OFF = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家', guardianBetaEnabled: false }

// AES-256-GCM ciphertext shape: 12-byte IV (24 hex) : 16-byte authTag (32 hex)
// : variable-length ciphertext (hex). lib/crypto.ts produces exactly this.
const CIPHERTEXT_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/

beforeEach(() => {
  resetDbMocks()
  setMockUser(VIEWER)
})

// ── createChild ──────────────────────────────────────────────────────────────

describe('createChild', () => {
  it('creates asset + childDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets insert
    queueDbResult([])                    // childDetails insert

    await expect(createChild({ name: '小元' })).resolves.toMatchObject({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('passes all childDetails fields to insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2' }])
    queueDbResult([])

    await createChild({
      name: '小元',
      nickname: '元元',
      gender: 'female',
      birthday: '2023-03-15',
      nationalId: 'A123456789',
      nhiNo: 'NHI-001',
      bloodType: 'A',
      hospital: '台大醫院',
      heightCm: 80,
      weightG: 9000,
    })

    const valueCalls = mockBuilder.values.mock.calls
    const childPayload = valueCalls[1][0] as Record<string, unknown>
    expect(childPayload).toMatchObject({
      assetId: 'asset-2',
      nickname: '元元',
      gender: 'female',
      birthday: '2023-03-15',
      bloodType: 'A',
      hospital: '台大醫院',
      heightCm: 80,
      weightG: 9000,
    })
    // Encrypted PII fields must NOT be raw plaintext anymore (security fix).
    // Round-trip via decrypt() to prove correctness.
    expect(childPayload.idNumberEncrypted).not.toBe('A123456789')
    expect(childPayload.idNumberEncrypted).toMatch(CIPHERTEXT_RE)
    expect(decrypt(childPayload.idNumberEncrypted as string)).toBe('A123456789')
    expect(childPayload.insuranceIdEncrypted).not.toBe('NHI-001')
    expect(childPayload.insuranceIdEncrypted).toMatch(CIPHERTEXT_RE)
    expect(decrypt(childPayload.insuranceIdEncrypted as string)).toBe('NHI-001')
  })

  it('null PII fields stay null (no encryption of null)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2b' }])
    queueDbResult([])

    await createChild({
      name: '小元',
      nationalId: null,
      nhiNo: null,
    })

    const valueCalls = mockBuilder.values.mock.calls
    const childPayload = valueCalls[1][0] as Record<string, unknown>
    expect(childPayload.idNumberEncrypted).toBeNull()
    expect(childPayload.insuranceIdEncrypted).toBeNull()
  })

  it('omitted PII fields stay null on create', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-2c' }])
    queueDbResult([])

    await createChild({ name: '小元' })

    const valueCalls = mockBuilder.values.mock.calls
    const childPayload = valueCalls[1][0] as Record<string, unknown>
    expect(childPayload.idNumberEncrypted).toBeNull()
    expect(childPayload.insuranceIdEncrypted).toBeNull()
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createChild({ name: '小元' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createChild({ name: '   ' })).rejects.toThrow(/名稱/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createChild({ name: '小元' })).rejects.toThrow('找不到家計簿')
  })
})

// ── editChild ────────────────────────────────────────────────────────────────

describe('editChild', () => {
  it('updates asset name + sets childDetails fields', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning
    queueDbResult([])                    // childDetails upsert

    await expect(editChild({ id: 'asset-1', name: '新名字' })).resolves.toBeUndefined()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets update returning empty
    await expect(editChild({ id: 'missing', name: '小元' })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editChild({ id: 'asset-1', name: '小元' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editChild({ id: 'asset-1', name: '  ' })).rejects.toThrow(/名稱/)
  })

  // ── Trinary PII semantics ────────────────────────────────────────────────

  it('PII trinary "keep": omits PII keys from upsert SET when input absent', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([])

    await editChild({ id: 'asset-1', name: '小元' })

    // The upsert SET clause is the second argument of the second .values()
    // call's .onConflictDoUpdate (call sequence: tx.update(assets) then
    // tx.insert(childDetails).values(...).onConflictDoUpdate({ set: ... })).
    const conflictCall = mockBuilder.onConflictDoUpdate.mock.calls[0]
    const setObj = (conflictCall[0] as { set: Record<string, unknown> }).set
    expect(setObj).not.toHaveProperty('idNumberEncrypted')
    expect(setObj).not.toHaveProperty('insuranceIdEncrypted')
  })

  it('PII trinary "clear": null in payload writes null to upsert SET', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([])

    await editChild({ id: 'asset-1', name: '小元', nationalId: null, nhiNo: null })

    const conflictCall = mockBuilder.onConflictDoUpdate.mock.calls[0]
    const setObj = (conflictCall[0] as { set: Record<string, unknown> }).set
    expect(setObj.idNumberEncrypted).toBeNull()
    expect(setObj.insuranceIdEncrypted).toBeNull()
  })

  it('PII trinary "set": string in payload writes encrypted ciphertext to upsert SET', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])
    queueDbResult([])

    await editChild({
      id: 'asset-1',
      name: '小元',
      nationalId: 'A123456789',
      nhiNo: 'NHI-002',
    })

    const conflictCall = mockBuilder.onConflictDoUpdate.mock.calls[0]
    const setObj = (conflictCall[0] as { set: Record<string, unknown> }).set
    expect(setObj.idNumberEncrypted).not.toBe('A123456789')
    expect(setObj.idNumberEncrypted).toMatch(CIPHERTEXT_RE)
    expect(decrypt(setObj.idNumberEncrypted as string)).toBe('A123456789')
    expect(setObj.insuranceIdEncrypted).not.toBe('NHI-002')
    expect(setObj.insuranceIdEncrypted).toMatch(CIPHERTEXT_RE)
    expect(decrypt(setObj.insuranceIdEncrypted as string)).toBe('NHI-002')
  })
})

// ── revealChildPii ──────────────────────────────────────────────────────────

describe('revealChildPii', () => {
  it('returns plaintext when ciphertext present and asset belongs to group', async () => {
    const { encrypt } = await import('@/lib/crypto')
    const ct = encrypt('A123456789')

    queueDbResult([GROUP])
    queueDbResult([{
      assetType: 'child',
      assetDeletedAt: null,
      idNumberEncrypted: ct,
      insuranceIdEncrypted: null,
    }])

    await expect(revealChildPii('asset-1', 'nationalId')).resolves.toBe('A123456789')
  })

  it('throws when asset not found in viewer group (cross-group access)', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // join returns no rows — assetId is in another group

    await expect(revealChildPii('asset-x', 'nationalId')).rejects.toThrow(/找不到/)
  })

  it('throws when asset is soft-deleted', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      assetType: 'child',
      assetDeletedAt: new Date(),
      idNumberEncrypted: 'doesnt-matter',
      insuranceIdEncrypted: null,
    }])

    await expect(revealChildPii('asset-1', 'nationalId')).rejects.toThrow(/找不到/)
  })

  it('throws when asset type is not child (e.g. car)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      assetType: 'car',
      assetDeletedAt: null,
      idNumberEncrypted: null,
      insuranceIdEncrypted: null,
    }])

    await expect(revealChildPii('asset-1', 'nationalId')).rejects.toThrow(/找不到/)
  })

  it('throws when ciphertext column is null (nothing stored)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{
      assetType: 'child',
      assetDeletedAt: null,
      idNumberEncrypted: null,
      insuranceIdEncrypted: null,
    }])

    await expect(revealChildPii('asset-1', 'nationalId')).rejects.toThrow(/尚未填寫/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(revealChildPii('asset-1', 'nationalId')).rejects.toThrow('Unauthorized')
  })
})

// ── createPet ────────────────────────────────────────────────────────────────

describe('createPet', () => {
  it('creates asset + petDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets insert
    queueDbResult([])                    // petDetails insert

    await expect(createPet({ name: '米嚕' })).resolves.toMatchObject({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('passes all petDetails fields to insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-3' }])
    queueDbResult([])

    await createPet({
      name: '米嚕',
      species: 'cat',
      breed: '混種',
      sex: 'female',
      birthDate: '2022-01-10',
      adoptedDate: '2022-03-01',
      purchaseCost: 0,
      weightG: 4200,
      chipNo: 'CHIP-001',
      vet: '動物醫院',
    })

    const valueCalls = mockBuilder.values.mock.calls
    const petPayload = valueCalls[1][0] as Record<string, unknown>
    expect(petPayload).toMatchObject({
      assetId: 'asset-3',
      species: 'cat',
      breed: '混種',
      sex: 'female',
      birthDate: '2022-01-10',
      adoptedDate: '2022-03-01',
      weightG: 4200,
      chipNo: 'CHIP-001',
      vet: '動物醫院',
    })
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createPet({ name: '米嚕' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createPet({ name: '   ' })).rejects.toThrow(/名稱/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createPet({ name: '米嚕' })).rejects.toThrow('找不到家計簿')
  })
})

// ── editPet ──────────────────────────────────────────────────────────────────

describe('editPet', () => {
  it('updates asset name + sets petDetails fields', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning
    queueDbResult([])                    // petDetails upsert

    await expect(editPet({ id: 'asset-1', name: '新名字' })).resolves.toBeUndefined()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets update returning empty
    await expect(editPet({ id: 'missing', name: '米嚕' })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editPet({ id: 'asset-1', name: '米嚕' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editPet({ id: 'asset-1', name: '  ' })).rejects.toThrow(/名稱/)
  })
})

// ── createPlant ──────────────────────────────────────────────────────────────

describe('createPlant', () => {
  it('creates asset + plantDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets insert
    queueDbResult([])                    // plantDetails insert

    await expect(createPlant({ name: '阿龜' })).resolves.toMatchObject({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('passes all plantDetails fields to insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-7' }])
    queueDbResult([])

    await createPlant({
      name: '阿龜',
      species: '龜背芋',
      location: '北向陽台',
      sproutedAt: '2024-03-10',
      cost: 1850,
      waterEvery: 7,
    })

    const valueCalls = mockBuilder.values.mock.calls
    const plantPayload = valueCalls[1][0] as Record<string, unknown>
    expect(plantPayload).toMatchObject({
      assetId: 'asset-7',
      species: '龜背芋',
      location: '北向陽台',
      sproutedAt: '2024-03-10',
      cost: 1850,
      waterEvery: 7,
    })
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createPlant({ name: '阿龜' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createPlant({ name: '   ' })).rejects.toThrow(/名稱/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createPlant({ name: '阿龜' })).rejects.toThrow('找不到家計簿')
  })
})

// ── editPlant ────────────────────────────────────────────────────────────────

describe('editPlant', () => {
  it('updates asset name + sets plantDetails fields', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning
    queueDbResult([])                    // plantDetails upsert

    await expect(editPlant({ id: 'asset-1', name: '新名字' })).resolves.toBeUndefined()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets update returning empty
    await expect(editPlant({ id: 'missing', name: '阿龜' })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editPlant({ id: 'asset-1', name: '阿龜' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editPlant({ id: 'asset-1', name: '  ' })).rejects.toThrow(/名稱/)
  })
})

// ── createInsurance ──────────────────────────────────────────────────────────

describe('createInsurance', () => {
  it('creates asset + insuranceDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets insert
    queueDbResult([])                    // insuranceDetails insert

    await expect(createInsurance({ name: '壽險A' })).resolves.toMatchObject({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('defaults insuredType=user when no Child 愛物 is linked', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-4' }])
    queueDbResult([])

    await createInsurance({ name: '壽險A' })

    const valueCalls = mockBuilder.values.mock.calls
    const insPayload = valueCalls[1][0] as Record<string, unknown>
    expect(insPayload.insuredType).toBe('user')
    expect(insPayload.insuredChildId).toBeNull()
  })

  // #167 — Linking a Child 愛物 flips insuredType to 'child' and clears the
  // freeform `insured` text so the child name becomes the source of truth.
  it('flips insuredType=child + clears insured text when insuredChildId is set', async () => {
    const CHILD_ID = '11111111-1111-1111-1111-111111111111'
    queueDbResult([GROUP])
    queueDbResult([{ id: CHILD_ID, type: 'child', deletedAt: null }])  // child lookup
    queueDbResult([{ id: 'asset-6' }])
    queueDbResult([])

    await createInsurance({
      name: '醫療險',
      insured: '會被覆蓋的文字',
      insuredChildId: CHILD_ID,
    })

    const valueCalls = mockBuilder.values.mock.calls
    const insPayload = valueCalls[1][0] as Record<string, unknown>
    expect(insPayload.insuredType).toBe('child')
    expect(insPayload.insuredChildId).toBe(CHILD_ID)
    expect(insPayload.insured).toBeNull()
  })

  it('rejects insuredChildId when target asset is not a child', async () => {
    const NOT_CHILD = '22222222-2222-2222-2222-222222222222'
    queueDbResult([GROUP])
    queueDbResult([{ id: NOT_CHILD, type: 'pet', deletedAt: null }])  // wrong type

    await expect(
      createInsurance({ name: '醫療險', insuredChildId: NOT_CHILD }),
    ).rejects.toThrow(/被保小孩/)
  })

  it('rejects insuredChildId that does not exist in the group', async () => {
    const MISSING = '33333333-3333-3333-3333-333333333333'
    queueDbResult([GROUP])
    queueDbResult([])  // child lookup returns nothing

    await expect(
      createInsurance({ name: '醫療險', insuredChildId: MISSING }),
    ).rejects.toThrow(/被保小孩/)
  })

  it('passes all insuranceDetails fields to insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-5' }])
    queueDbResult([])

    await createInsurance({
      name: '壽險A',
      kind: 'life',
      insured: '張三',
      insurer: '富邦',
      policyNo: 'POL-001',
      annualPremium: 12000,
      sumInsured: 2000000,
      payCycle: 'annual',
      startsAt: '2024-01-01',
      endsAt: '2044-01-01',
      termYears: 20,
    })

    const valueCalls = mockBuilder.values.mock.calls
    const insPayload = valueCalls[1][0] as Record<string, unknown>
    expect(insPayload).toMatchObject({
      assetId: 'asset-5',
      insuranceType: 'life',
      insured: '張三',
      insurer: '富邦',
      policyNumber: 'POL-001',
      annualPremium: 12000,
      sumInsured: 2000000,
      payCycle: 'annual',
      startsAt: '2024-01-01',
      expiryDate: '2044-01-01',
      termYears: 20,
      insuredType: 'user',
    })
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createInsurance({ name: '壽險A' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createInsurance({ name: '   ' })).rejects.toThrow(/名稱/)
  })

  // #221 — server-side safety net for the Guardian beta gate.
  it('throws guardian_disabled when beta flag is off on the group', async () => {
    queueDbResult([GROUP_GUARDIAN_OFF])
    await expect(createInsurance({ name: '壽險A' })).rejects.toThrow('guardian_disabled')
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createInsurance({ name: '壽險A' })).rejects.toThrow('找不到家計簿')
  })
})

// ── editInsurance ────────────────────────────────────────────────────────────

describe('editInsurance', () => {
  it('updates asset name + sets insuranceDetails fields', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets update .returning
    queueDbResult([])                    // insuranceDetails upsert

    await expect(editInsurance({ id: 'asset-1', name: '新名字' })).resolves.toBeUndefined()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])  // assets update returning empty
    await expect(editInsurance({ id: 'missing', name: '壽險A' })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editInsurance({ id: 'asset-1', name: '壽險A' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editInsurance({ id: 'asset-1', name: '  ' })).rejects.toThrow(/名稱/)
  })
})

// ── createHouse ──────────────────────────────────────────────────────────────

describe('createHouse', () => {
  it('creates asset + houseDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-h1' }])
    queueDbResult([])

    await expect(createHouse({ name: '我們家' })).resolves.toMatchObject({ id: 'asset-h1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('passes all houseDetails fields to insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-h2' }])
    queueDbResult([])

    await createHouse({
      name: '台北的家',
      address: '台北市大安區某路1號',
      purchasedAt: '2020-06-15',
    })

    const valueCalls = mockBuilder.values.mock.calls
    const housePayload = valueCalls[1][0] as Record<string, unknown>
    expect(housePayload).toMatchObject({
      assetId: 'asset-h2',
      owner: VIEWER.id,
      address: '台北市大安區某路1號',
      purchasedAt: '2020-06-15',
    })
  })

  it('creates auto-transaction when purchasePrice > 0', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-h3' }])
    queueDbResult([])
    queueDbResult([{ id: 'txn-h1' }])

    await createHouse({ name: '我們家', purchasePrice: 15000000 })

    expect(mockDb.insert).toHaveBeenCalledTimes(3)
    const valueCalls = mockBuilder.values.mock.calls
    const txnPayload = valueCalls[2][0] as Record<string, unknown>
    expect(txnPayload).toMatchObject({
      groupId: 'grp-1',
      assetId: 'asset-h3',
      amount: 15000000,
      category: 'housing',
      description: '購入 · 我們家',
    })
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(createHouse({ name: '我們家' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(createHouse({ name: '   ' })).rejects.toThrow(/名稱/)
  })

  it('throws when group not found', async () => {
    queueDbResult([])
    await expect(createHouse({ name: '我們家' })).rejects.toThrow('找不到家計簿')
  })
})

// ── editHouse ────────────────────────────────────────────────────────────────

describe('editHouse', () => {
  it('updates asset name + houseDetails fields', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-h1' }])
    queueDbResult([])

    await expect(editHouse({ id: 'asset-h1', name: '新家' })).resolves.toBeUndefined()
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('throws if asset not found in group', async () => {
    queueDbResult([GROUP])
    queueDbResult([])
    await expect(editHouse({ id: 'missing', name: '我們家' })).rejects.toThrow(/找不到/)
  })

  it('throws unauthorized when no user', async () => {
    setMockUser(null)
    await expect(editHouse({ id: 'asset-h1', name: '我們家' })).rejects.toThrow('Unauthorized')
  })

  it('throws on empty name', async () => {
    await expect(editHouse({ id: 'asset-h1', name: '  ' })).rejects.toThrow(/名稱/)
  })
})

// ── notes round-trip on Assets table ────────────────────────────────────────
// PR #6: notes lives on assets.notes (not the per-type *Details rows). Verify
// the column flows from action input → assets insert via createChild + createPet.

describe('notes round-trip', () => {
  it('createChild: notes flows into assets insert (first .values call)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-n1' }])
    queueDbResult([])

    await createChild({ name: '小元', notes: '上次健檢一切正常\n下次回診 6/12' })

    const assetsPayload = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(assetsPayload).toMatchObject({
      type: 'child',
      name: '小元',
      notes: '上次健檢一切正常\n下次回診 6/12',
    })
  })

  it('createPet: empty/whitespace notes coerced to null on assets insert', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-n2' }])
    queueDbResult([])

    await createPet({ name: '米嚕', notes: '   \n  ' })

    const assetsPayload = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(assetsPayload).toMatchObject({ type: 'pet', name: '米嚕', notes: null })
  })

  it('createPet: trims surrounding whitespace, preserves inner newlines', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-n3' }])
    queueDbResult([])

    await createPet({ name: '米嚕', notes: '  晶片 12345\n獸醫：王醫師  ' })

    const assetsPayload = mockBuilder.values.mock.calls[0][0] as Record<string, unknown>
    expect(assetsPayload.notes).toBe('晶片 12345\n獸醫：王醫師')
  })
})
