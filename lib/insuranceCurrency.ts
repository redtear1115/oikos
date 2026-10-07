import type { CurrencyCode } from '@/lib/currency'

/**
 * #1600 — a policy carries its own currency; NULL (a row older than the
 * column, or inserted by pre-#1600 code) means "the ledger's base currency",
 * which is what the amounts were entered in before the column existed.
 */
export function policyCurrency(
  stored: CurrencyCode | null | undefined,
  base: CurrencyCode,
): CurrencyCode {
  return stored ?? base
}

/**
 * #1600 — the policy's figures and the ledger's paid / returned totals are in
 * the same currency. When they are not, nothing may compare them: no progress
 * bar, no 105% judgement, no prefilled maturity amount (no FX is applied).
 * Failure looks like: a USD policy's 預估滿期金 compared with a TWD ledger's
 * 已繳, a bar at 3% and an "over target" nudge that mean nothing.
 */
export function sameCurrency(
  stored: CurrencyCode | null | undefined,
  base: CurrencyCode,
): boolean {
  return policyCurrency(stored, base) === base
}

/**
 * #1600 — total annual premium across policies, one amount per currency (no
 * FX). The ledger's base currency comes first, the rest in code order. With
 * no policies the base currency still shows (0), so an empty or same-currency
 * ledger renders exactly as before; a zero base total next to foreign ones is
 * dropped.
 */
export function sumPremiumByCurrency(
  policies: ReadonlyArray<{ annualPremium: number | null; currency: CurrencyCode | null | undefined }>,
  base: CurrencyCode,
): Array<{ currency: CurrencyCode; total: number }> {
  const totals = new Map<CurrencyCode, number>([[base, 0]])
  for (const p of policies) {
    const c = policyCurrency(p.currency, base)
    totals.set(c, (totals.get(c) ?? 0) + (p.annualPremium ?? 0))
  }
  if (policies.length > 0 && totals.get(base) === 0 && totals.size > 1) totals.delete(base)
  return [...totals.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => Number(b.currency === base) - Number(a.currency === base) || a.currency.localeCompare(b.currency))
}
