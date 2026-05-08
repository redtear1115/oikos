import { describe, it, expect, beforeEach } from 'vitest'
import { queueDbResult, resetDbMocks } from '../tests/_mocks/db'
import { getChildDetails } from '@/lib/db/queries/aibutsu'

beforeEach(() => resetDbMocks())

describe('getChildDetails', () => {
  it('returns booleans (not plaintext) for the encrypted PII columns', async () => {
    queueDbResult([
      {
        birthday: '2023-03-15',
        gender: 'female',
        idNumberEncrypted: 'iv:tag:ciphertext',  // any non-null string ⇒ true
        insuranceIdEncrypted: 'iv:tag:ciphertext2',
        nickname: '元元',
        hospital: '台大醫院',
        bloodType: 'A',
        heightCm: 80,
        weightG: 9000,
      },
    ])

    const row = await getChildDetails('asset-1')
    expect(row).not.toBeNull()
    expect(row).toEqual({
      birthday: '2023-03-15',
      gender: 'female',
      hasNationalId: true,
      hasNhiNo: true,
      nickname: '元元',
      hospital: '台大醫院',
      bloodType: 'A',
      heightCm: 80,
      weightG: 9000,
    })
    // Critical: ciphertext must NOT leak through this query.
    expect(row).not.toHaveProperty('nationalId')
    expect(row).not.toHaveProperty('nhiNo')
    expect(row).not.toHaveProperty('idNumberEncrypted')
    expect(row).not.toHaveProperty('insuranceIdEncrypted')
  })

  it('returns false for hasX when columns are null', async () => {
    queueDbResult([
      {
        birthday: null,
        gender: null,
        idNumberEncrypted: null,
        insuranceIdEncrypted: null,
        nickname: null,
        hospital: null,
        bloodType: null,
        heightCm: null,
        weightG: null,
      },
    ])

    const row = await getChildDetails('asset-1')
    expect(row?.hasNationalId).toBe(false)
    expect(row?.hasNhiNo).toBe(false)
  })

  it('returns null when no row exists', async () => {
    queueDbResult([])
    const row = await getChildDetails('asset-x')
    expect(row).toBeNull()
  })
})
