import { describe, it, expect, beforeEach } from 'vitest'
import { setMockUser } from './_mocks/supabase'
import { mockDb, mockBuilder, queueDbResult, resetDbMocks } from './_mocks/db'
import {
  createChild, editChild,
  createPet, editPet,
  createInsurance, editInsurance,
} from '@/actions/asset'

const VIEWER = { id: 'user-a', email: 'a@example.com' }
const GROUP = { id: 'grp-1', memberA: 'user-a', memberB: 'user-b', name: '我們家' }

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
      idNumberEncrypted: 'A123456789',
      insuranceIdEncrypted: 'NHI-001',
      bloodType: 'A',
      hospital: '台大醫院',
      heightCm: 80,
      weightG: 9000,
    })
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

// ── createInsurance ──────────────────────────────────────────────────────────

describe('createInsurance', () => {
  it('creates asset + insuranceDetails row', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-1' }])  // assets insert
    queueDbResult([])                    // insuranceDetails insert

    await expect(createInsurance({ name: '壽險A' })).resolves.toMatchObject({ id: 'asset-1' })
    expect(mockDb.transaction).toHaveBeenCalledOnce()
  })

  it('always sets insuredType=user (NOT NULL default)', async () => {
    queueDbResult([GROUP])
    queueDbResult([{ id: 'asset-4' }])
    queueDbResult([])

    await createInsurance({ name: '壽險A' })

    const valueCalls = mockBuilder.values.mock.calls
    const insPayload = valueCalls[1][0] as Record<string, unknown>
    expect(insPayload.insuredType).toBe('user')
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
