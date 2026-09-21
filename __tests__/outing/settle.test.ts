import { describe, it, expect } from 'vitest'
import { minimalTransfers } from '@/lib/outing/settle'

describe('minimalTransfers', () => {
  it('single debtor pays single creditor', () => {
    const t = minimalTransfers(new Map([['a', 50], ['b', -50]]))
    expect(t).toEqual([{ from: 'b', to: 'a', amount: 50 }])
  })

  it('all-zero nets → no transfers', () => {
    expect(minimalTransfers(new Map([['a', 0], ['b', 0]]))).toEqual([])
  })

  it('produces at most n−1 transfers', () => {
    const nets = new Map([['a', 100], ['b', -50], ['c', -30], ['d', -20]])
    const t = minimalTransfers(nets)
    expect(t.length).toBeLessThanOrEqual(nets.size - 1)
  })

  it('applying transfers zeroes every net (settles fully)', () => {
    const nets = new Map([['a', 100], ['b', -50], ['c', -50]])
    const settled = new Map(nets)
    for (const { from, to, amount } of minimalTransfers(nets)) {
      settled.set(from, (settled.get(from) ?? 0) + amount)
      settled.set(to, (settled.get(to) ?? 0) - amount)
    }
    for (const v of settled.values()) expect(v).toBe(0)
  })

  it('is deterministic (stable order)', () => {
    const make = () => new Map([['a', 100], ['b', -50], ['c', -50]])
    expect(minimalTransfers(make())).toEqual(minimalTransfers(make()))
  })
})
