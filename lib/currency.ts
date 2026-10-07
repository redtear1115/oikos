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

// USD is the only known sub-unit currency in OUTING tables (minor units, i.e.
// cents). Main-ledger amounts are whole units for every currency (#1582). All
// other codes — including free-text like VND / EUR — are treated as integer-storage. This is
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
 * MINOR-UNIT amounts: outing amounts only (OutingExpenses / OutingSettlements,
 * USD in cents, so `1250` renders as `$12.50`). Do NOT use this for main-ledger,
 * trip or FX-converted amounts (all whole units) — use `formatLedgerAmountParts`
 * below. (Retraction, #1582: this doc used to list the FX path and trip amounts
 * as minor units; that was wrong.) Mixing them is silent: a USD-base ledger
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

/** Minor-unit single-string form of `formatAmountParts` (outing amounts only). */
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

/** Same as `formatLedgerAmount` but "symbol + space + digits" (`NT$ 500,000`), for detail rows that keep that design. */
export function formatLedgerAmountSpaced(amount: number, currency: string): string {
  const { sign, symbol, digits } = formatLedgerAmountParts(amount, currency)
  return `${sign}${symbol.trim()} ${digits}`
}

/**
 * Convert a main-ledger amount (whole units of the source currency) into whole
 * units of the target currency. `rate` is the composite rate: 1 whole unit of
 * the source = `rate` whole units of the target. Chained conversions must
 * multiply their rates first and call this once, so rounding happens once.
 *
 * Contract: `amount > 0 => result >= 1`. A positive entry that would round to
 * 0 (NT$15 into a USD ledger at 0.03) is stored as 1 rather than as a free
 * purchase (#1582). Non-positive amounts come back as `Math.round(amount * rate)`.
 *
 * Retraction (#1582): this replaces `convertAmount`, which treated USD as
 * cents (/100 in, x100 out). Ledger amounts are whole units for every
 * currency, so on a USD-base ledger the old converter stored 100x the right
 * value (or 1/100 of it for USD input), with no error. Do not reintroduce a
 * precision-aware converter on a ledger path.
 */
export function convertWholeUnits(amount: number, rate: number): number {
  const converted = Math.round(amount * rate)
  return amount > 0 ? Math.max(1, converted) : converted
}

/**
 * Outing amounts are minor units (USD cents). Convert to whole units for the
 * main ledger. Rounds half up for positive amounts; may return 0 for a
 * sub-unit residual, which the caller must treat as "nothing to settle".
 */
export function minorToWhole(amount: number, currency: string): number {
  return currencyPrecision(currency) === 2 ? Math.round(amount / 100) : amount
}
