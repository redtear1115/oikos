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

export interface AmountParts {
  /** '-' for negative amounts, '' otherwise. */
  sign: string
  /** Currency symbol, e.g. 'NT$'. */
  symbol: string
  /** Formatted magnitude, e.g. '1,234'. */
  digits: string
}

function partsFromDisplay(display: number, negative: boolean, currency: string, precision: 0 | 2): AmountParts {
  const digits = display.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })
  return { sign: negative ? '-' : '', symbol: currencySymbol(currency), digits }
}

/**
 * MINOR-UNIT amounts: the FX path (`convertAmount` / `convertViaSnapshot`
 * output, trip / outing amounts). USD is stored in cents, so `1250` renders
 * as `$12.50`. Do NOT use this for main-ledger amounts — use
 * `formatLedgerAmountParts` below. Mixing them is silent: a USD-base ledger
 * that recorded $45 would show $0.45, with no error (#1399 / #1482).
 *
 * Splits an amount into sign / symbol / digits so layouts that render the
 * symbol and digits at different sizes (hero stats, split amount tiles)
 * don't each re-derive this from scratch. `formatAmount` composes its
 * single-string output from these same parts (#1358).
 */
export function formatAmountParts(amount: number, currency: string): AmountParts {
  const abs = Math.abs(amount)
  const precision = currencyPrecision(currency)
  return partsFromDisplay(precision === 2 ? abs / 100 : abs, amount < 0, currency, precision)
}

/** Minor-unit single-string form of `formatAmountParts` (FX path only). */
export function formatAmount(amount: number, currency: string): string {
  const { sign, symbol, digits } = formatAmountParts(amount, currency)
  return `${sign}${symbol}${digits}`
}

/**
 * MAIN-LEDGER amounts: CashTransactions / IncomeTransactions / Settlements and
 * every total derived from them are stored as integer whole units as typed
 * (元 / $ / ¥) — never divided by 100 and shown without decimals, whatever the ledger's base currency
 * (#1399 decision (a)). `currency` is the ledger's base currency
 * (`useBaseCurrency()` on the client, `group.baseCurrency` on the server);
 * it only picks the symbol here.
 */
export function formatLedgerAmountParts(amount: number, currency: string): AmountParts {
  return partsFromDisplay(Math.abs(amount), amount < 0, currency, 0)
}

export function formatLedgerAmount(amount: number, currency: string): string {
  const { sign, symbol, digits } = formatLedgerAmountParts(amount, currency)
  return `${sign}${symbol}${digits}`
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
