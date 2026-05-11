import { describe, it, expect } from 'vitest'
import { validateChildInput, validatePetInput, validatePlantInput, validateInsuranceInput } from '@/lib/validators'

const childBase = { name: '小元' }
const petBase = { name: '米嚕' }
const insBase = { name: '小元的醫療險' }

describe('validateChildInput', () => {
  it('accepts minimal input (name only)', () => {
    const r = validateChildInput(childBase)
    expect(r.name).toBe('小元')
    expect(r.birthday).toBeNull()
    expect(r.gender).toBeNull()
    expect(r.heightCm).toBeNull()
  })

  it('accepts full input', () => {
    const r = validateChildInput({
      name: '小元', nickname: '元寶', gender: 'male', birthday: '2021-08-14',
      nationalId: 'A123456789', nhiNo: '0000-1234-5678-90',
      bloodType: 'O', hospital: '臺大醫院', heightCm: 102, weightG: 16400,
    })
    expect(r.nickname).toBe('元寶')
    expect(r.gender).toBe('male')
    expect(r.bloodType).toBe('O')
    expect(r.heightCm).toBe(102)
    expect(r.weightG).toBe(16400)
    expect(r.nationalId).toBe('A123456789')
    expect(r.nhiNo).toBe('0000-1234-5678-90')
  })

  it('rejects invalid gender', () => {
    expect(() => validateChildInput({ name: '小元', gender: 'X' as 'male' })).toThrow(/性別/)
  })

  it('rejects negative heightCm', () => {
    expect(() => validateChildInput({ name: '小元', heightCm: -1 })).toThrow(/身高/)
  })

  // ── PII trinary semantics — see lib/validators.ts normalisePiiTrinary ──
  describe('PII trinary (nationalId / nhiNo)', () => {
    it('omits nationalId from result when key absent (no change)', () => {
      const r = validateChildInput({ name: '小元' })
      expect(r.nationalId).toBeUndefined()
      expect(r.nhiNo).toBeUndefined()
    })

    it('preserves explicit null (clear)', () => {
      const r = validateChildInput({ name: '小元', nationalId: null, nhiNo: null })
      expect(r.nationalId).toBeNull()
      expect(r.nhiNo).toBeNull()
    })

    it('treats whitespace-only string as clear (null)', () => {
      const r = validateChildInput({ name: '小元', nationalId: '   ', nhiNo: '\t' })
      expect(r.nationalId).toBeNull()
      expect(r.nhiNo).toBeNull()
    })

    it('returns trimmed string when present', () => {
      const r = validateChildInput({ name: '小元', nationalId: '  A123456789  ', nhiNo: 'NHI-1' })
      expect(r.nationalId).toBe('A123456789')
      expect(r.nhiNo).toBe('NHI-1')
    })

    it('treats explicit undefined the same as missing key', () => {
      const r = validateChildInput({ name: '小元', nationalId: undefined, nhiNo: undefined })
      expect(r.nationalId).toBeUndefined()
      expect(r.nhiNo).toBeUndefined()
    })
  })
})

describe('validatePetInput', () => {
  it('accepts minimal input', () => {
    const r = validatePetInput(petBase)
    expect(r.name).toBe('米嚕')
    expect(r.species).toBeNull()
    expect(r.birthDate).toBeNull()
  })

  it('accepts full input', () => {
    const r = validatePetInput({
      name: '米嚕', species: '貓', breed: '美短', sex: 'female',
      birthDate: '2023-06-20', adoptedDate: '2023-09-12',
      purchaseCost: 12000, weightG: 4200, chipNo: '900141001234567', vet: '永和動物醫院',
    })
    expect(r.species).toBe('貓')
    expect(r.purchaseCost).toBe(12000)
    expect(r.chipNo).toBe('900141001234567')
  })

  it('rejects negative purchaseCost', () => {
    expect(() => validatePetInput({ name: '米嚕', purchaseCost: -1 })).toThrow(/金額/)
  })
})

describe('validatePlantInput', () => {
  it('accepts minimal input (name only)', () => {
    const r = validatePlantInput({ name: '龜背芋' })
    expect(r.name).toBe('龜背芋')
    expect(r.species).toBeNull()
    expect(r.location).toBeNull()
    expect(r.sproutedAt).toBeNull()
    expect(r.cost).toBeNull()
    expect(r.waterEvery).toBeNull()
  })

  it('accepts full input', () => {
    const r = validatePlantInput({
      name: '阿龜', species: '龜背芋', location: '北向陽台',
      sproutedAt: '2024-03-10', cost: 1850, waterEvery: 7,
    })
    expect(r.species).toBe('龜背芋')
    expect(r.location).toBe('北向陽台')
    expect(r.cost).toBe(1850)
    expect(r.waterEvery).toBe(7)
  })

  it('rejects negative cost', () => {
    expect(() => validatePlantInput({ name: '阿龜', cost: -1 })).toThrow(/金額/)
  })

  it('rejects zero waterEvery', () => {
    expect(() => validatePlantInput({ name: '阿龜', waterEvery: 0 })).toThrow(/澆水週期/)
  })
})

describe('validateInsuranceInput', () => {
  it('accepts minimal input', () => {
    const r = validateInsuranceInput(insBase)
    expect(r.name).toBe('小元的醫療險')
    expect(r.insurer).toBeNull()
    expect(r.annualPremium).toBeNull()
  })

  it('accepts full input', () => {
    const r = validateInsuranceInput({
      name: '小元的醫療險', kind: 'medical', insured: '小元', insurer: '南山人壽',
      policyNo: 'NSL-001', annualPremium: 24960, sumInsured: 3000000,
      payCycle: 'annual', startsAt: '2022-09-01', endsAt: '2042-08-31', termYears: 20,
    })
    expect(r.kind).toBe('medical')
    expect(r.annualPremium).toBe(24960)
    expect(r.termYears).toBe(20)
  })

  it('rejects negative annualPremium', () => {
    expect(() => validateInsuranceInput({ name: '保單', annualPremium: -1 })).toThrow(/保費/)
  })

  it('rejects termYears <= 0', () => {
    expect(() => validateInsuranceInput({ name: '保單', termYears: 0 })).toThrow(/年期/)
  })

  // v0.15.0 #127
  it('defaults reminderDaysBefore to 30 when omitted', () => {
    const r = validateInsuranceInput(insBase)
    expect(r.reminderDaysBefore).toBe(30)
  })

  it('accepts custom reminderDaysBefore in 1..365', () => {
    expect(validateInsuranceInput({ name: '保單', reminderDaysBefore: 7 }).reminderDaysBefore).toBe(7)
    expect(validateInsuranceInput({ name: '保單', reminderDaysBefore: 365 }).reminderDaysBefore).toBe(365)
  })

  it('rejects reminderDaysBefore outside 1..365', () => {
    expect(() => validateInsuranceInput({ name: '保單', reminderDaysBefore: 0 })).toThrow(/提醒/)
    expect(() => validateInsuranceInput({ name: '保單', reminderDaysBefore: 366 })).toThrow(/提醒/)
    expect(() => validateInsuranceInput({ name: '保單', reminderDaysBefore: 1.5 })).toThrow(/提醒/)
  })
})

// ── notes (shared across all six asset types) ──────────────────────────
// Spot-check on Child + Pet because the trim/null/cap behavior is shared
// between all six validators (validateNotes is the single helper).
describe('notes field', () => {
  it('coerces undefined → null (Child)', () => {
    const r = validateChildInput(childBase)
    expect(r.notes).toBeNull()
  })

  it('coerces empty string → null (Child)', () => {
    const r = validateChildInput({ ...childBase, notes: '' })
    expect(r.notes).toBeNull()
  })

  it('coerces whitespace-only → null (Pet)', () => {
    const r = validatePetInput({ ...petBase, notes: '   \n  \t  ' })
    expect(r.notes).toBeNull()
  })

  it('preserves multi-line text and trims edges (Pet)', () => {
    const r = validatePetInput({ ...petBase, notes: '  上次健檢心跳偏快\n獸醫：王醫師  ' })
    expect(r.notes).toBe('上次健檢心跳偏快\n獸醫：王醫師')
  })

  it('rejects > 2000 chars (Child)', () => {
    const long = 'a'.repeat(2001)
    expect(() => validateChildInput({ ...childBase, notes: long })).toThrow(/備註/)
  })

  it('accepts exactly 2000 chars (Child)', () => {
    const exactly2000 = 'a'.repeat(2000)
    const r = validateChildInput({ ...childBase, notes: exactly2000 })
    expect(r.notes?.length).toBe(2000)
  })
})
