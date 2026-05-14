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

/**
 * Convert `amount` from currency `from` to currency `to` using `rate`.
 *
 * `rate` semantics: 1 display unit of `from` = `rate` display units of `to`.
 * (display unit = $1, ¥1, NT$1, 1 JPY — NOT cents)
 *
 * Internally:
 *   1. amount → display value of `from` (divide by 100 if from is USD)
 *   2. multiply by rate → display value of `to`
 *   3. → storage integer of `to` (multiply by 100 if to is USD)
 *   4. round to nearest integer
 */
export function convertAmount(input: {
  amount: number
  from: CurrencyCode
  to: CurrencyCode
  rate: number
}): number {
  const { amount, from, to, rate } = input
  if (from === to) return amount
  const fromDisplay = currencyPrecision(from) === 2 ? amount / 100 : amount
  const toDisplay = fromDisplay * rate
  const toStorage = currencyPrecision(to) === 2 ? toDisplay * 100 : toDisplay
  return Math.round(toStorage)
}
