export const CURRENCIES = ['twd', 'cny', 'usd', 'jpy'] as const
export type CurrencyCode = typeof CURRENCIES[number]

export function currencyPrecision(c: CurrencyCode): 0 | 2 {
  return c === 'usd' ? 2 : 0
}

const SYMBOL: Record<CurrencyCode, string> = {
  twd: 'NT$',
  cny: 'CN¥',
  usd: '$',
  jpy: '¥',
}

export function formatAmount(amount: number, currency: CurrencyCode): string {
  const negative = amount < 0
  const abs = Math.abs(amount)
  const precision = currencyPrecision(currency)
  const display = precision === 2 ? abs / 100 : abs
  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
  return `${negative ? '-' : ''}${SYMBOL[currency]}${formatted}`
}
