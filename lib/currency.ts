export const CURRENCIES = ['twd', 'cny', 'usd', 'jpy'] as const
export type CurrencyCode = typeof CURRENCIES[number]

export function currencyPrecision(c: CurrencyCode): 0 | 2 {
  return c === 'usd' ? 2 : 0
}
