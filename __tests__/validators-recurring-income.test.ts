import { describe, it, expect } from 'vitest'
import { validateRecurringIncomeRuleInput } from '@/lib/validators'

const base = {
  amount: 75000,
  category: 'salary',
  recipientId: 'user-a',
  intervalMonths: 1,
  dayOfMonth: 25,
  startsOn: '2026-05-01',
  endsOn: null,
  source: '公司 A 月薪',
  assetId: null,
}

describe('validateRecurringIncomeRuleInput', () => {
  it('passes a well-formed monthly rule', () => {
    const out = validateRecurringIncomeRuleInput(base)
    expect(out.amount).toBe(75000)
    expect(out.dayOfMonth).toBe(25)
  })
  it('rejects amount <= 0', () => {
    expect(() => validateRecurringIncomeRuleInput({ ...base, amount: 0 })).toThrow(/金額/)
  })
  it('rejects unknown category', () => {
    expect(() => validateRecurringIncomeRuleInput({ ...base, category: 'unknown' })).toThrow(/類別/)
  })
  it('rejects intervalMonths not in {1,3,6,12}', () => {
    expect(() => validateRecurringIncomeRuleInput({ ...base, intervalMonths: 2 })).toThrow(/週期/)
  })
  it('rejects dayOfMonth out of 1..31', () => {
    expect(() => validateRecurringIncomeRuleInput({ ...base, dayOfMonth: 0 })).toThrow(/號/)
    expect(() => validateRecurringIncomeRuleInput({ ...base, dayOfMonth: 32 })).toThrow(/號/)
  })
  it('rejects endsOn before startsOn', () => {
    expect(() => validateRecurringIncomeRuleInput({
      ...base, startsOn: '2026-05-01', endsOn: '2026-04-30',
    })).toThrow(/結束/)
  })
  it('trims source and converts empty to null', () => {
    expect(validateRecurringIncomeRuleInput({ ...base, source: '   ' }).source).toBeNull()
    expect(validateRecurringIncomeRuleInput({ ...base, source: ' x ' }).source).toBe('x')
  })
})
