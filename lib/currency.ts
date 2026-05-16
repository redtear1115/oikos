// Main-ledger currency enum (OikosGroups.base_currency + CashTransactions /
// IncomeTransactions / Settlements). Trip-scoped currencies are free-text —
// see lib/trip-currency.ts.
export const CURRENCIES = ['twd', 'cny', 'usd', 'jpy'] as const
export type CurrencyCode = typeof CURRENCIES[number]

/**
 * Boundary helper for narrowing untyped DB strings / external input to the
 * main-ledger `CurrencyCode` enum. Returns null for unknown / empty / non-string
 * inputs, callers decide on a fallback (typically the group's base currency or
 * 'twd'). Use this instead of `value as CurrencyCode` at any DB-→-enum edge
 * so unknown values fail loudly via the null branch rather than silently
 * propagating into formatting / conversion logic. Input is case-insensitive.
 */
export function parseCurrencyCode(input: unknown): CurrencyCode | null {
  if (typeof input !== 'string') return null
  const lower = input.toLowerCase()
  return (CURRENCIES as readonly string[]).includes(lower) ? (lower as CurrencyCode) : null
}

// USD is the only known sub-unit currency (stored in cents). All other codes —
// including free-text like VND / EUR — are treated as integer-storage. This is
// a deliberate simplification for v0.17.4; refine per-currency precision if/when
// users want EUR cents semantics.
export function currencyPrecision(c: string): 0 | 2 {
  return c.toLowerCase() === 'usd' ? 2 : 0
}

const SYMBOL: Record<string, string> = {
  twd: 'NT$',
  cny: 'CN¥',
  usd: '$',
  jpy: '¥',
}

/**
 * Display symbol for a currency. Unknown codes fall back to `${CODE} ` so
 * formatAmount stays readable for user-defined trip currencies (e.g. "VND 12,000").
 */
export function currencySymbol(c: string): string {
  return SYMBOL[c.toLowerCase()] ?? `${c.toUpperCase()} `
}

export function formatAmount(amount: number, currency: string): string {
  const negative = amount < 0
  const abs = Math.abs(amount)
  const precision = currencyPrecision(currency)
  const display = precision === 2 ? abs / 100 : abs
  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
  return `${negative ? '-' : ''}${currencySymbol(currency)}${formatted}`
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
  from: string
  to: string
  rate: number
}): number {
  const { amount, from, to, rate } = input
  if (from.toLowerCase() === to.toLowerCase()) return amount
  const fromDisplay = currencyPrecision(from) === 2 ? amount / 100 : amount
  const toDisplay = fromDisplay * rate
  const toStorage = currencyPrecision(to) === 2 ? toDisplay * 100 : toDisplay
  return Math.round(toStorage)
}
