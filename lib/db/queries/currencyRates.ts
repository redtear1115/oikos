import { db } from '@/lib/db/client'
import { currencyRates } from '@/lib/db/schema'
import type { CurrencyCode } from '@/lib/currency'
import { eq } from 'drizzle-orm'

// Canonical seed rates (TWD-anchored). User can edit anytime; these are
// just starting values when a group first opens currency settings.
const SEED_FROM_TWD: Record<Exclude<CurrencyCode, 'twd'>, string> = {
  cny: '0.220',
  usd: '0.032',
  jpy: '5.000',
}

export function defaultRatesFor(base: CurrencyCode): Array<{
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}> {
  const targets = (['twd', 'cny', 'usd', 'jpy'] as CurrencyCode[]).filter(c => c !== base)
  if (base === 'twd') {
    return targets.map(t => ({
      fromCurrency: 'twd' as CurrencyCode,
      toCurrency: t,
      rate: SEED_FROM_TWD[t as Exclude<CurrencyCode, 'twd'>],
    }))
  }
  const baseFromTwd = parseFloat(SEED_FROM_TWD[base as Exclude<CurrencyCode, 'twd'>])
  return targets.map(t => {
    if (t === 'twd') {
      return { fromCurrency: base, toCurrency: 'twd' as CurrencyCode, rate: (1 / baseFromTwd).toFixed(3) }
    }
    const twdToT = parseFloat(SEED_FROM_TWD[t as Exclude<CurrencyCode, 'twd'>])
    return { fromCurrency: base, toCurrency: t, rate: (twdToT / baseFromTwd).toFixed(3) }
  })
}

export async function listRatesForGroup(groupId: string) {
  return db.select().from(currencyRates).where(eq(currencyRates.groupId, groupId))
}

export async function upsertRate(input: {
  groupId: string
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rate: string
}) {
  return db
    .insert(currencyRates)
    .values(input)
    .onConflictDoUpdate({
      target: [currencyRates.groupId, currencyRates.fromCurrency, currencyRates.toCurrency],
      set: { rate: input.rate, updatedAt: new Date() },
    })
}
