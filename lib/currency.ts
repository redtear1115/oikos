export const CURRENCIES = ['twd', 'cny', 'usd', 'jpy'] as const
export type CurrencyCode = typeof CURRENCIES[number]
