import { describe, it, expect } from 'vitest'
import { validateTransactionInput } from '@/lib/validators'

const baseInput = {
  amount: 100,
  description: 'lunch',
  category: 'dining',
  splitType: 'half' as const,
  payerId: '00000000-0000-0000-0000-000000000001',
  transactedAt: new Date('2026-05-10T04:00:00Z'),
}

describe('validateTransactionInput — record status (issue #49)', () => {
  it('defaults to settled when status omitted', () => {
    const v = validateTransactionInput({ ...baseInput })
    expect(v.status).toBe('settled')
  })

  it('preserves explicit settled', () => {
    const v = validateTransactionInput({ ...baseInput, status: 'settled' })
    expect(v.status).toBe('settled')
  })

  it('preserves explicit pending (信用卡待結帳 / IOU)', () => {
    const v = validateTransactionInput({ ...baseInput, status: 'pending' })
    expect(v.status).toBe('pending')
  })

  it('rejects unknown status value', () => {
    expect(() =>
      validateTransactionInput({
        ...baseInput,
        // @ts-expect-error — exercising the runtime guard
        status: 'archived',
      }),
    ).toThrow('狀態無效')
  })
})
