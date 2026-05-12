/**
 * Insurance kind classification (savings / protection / car) for framing the
 * detail page. `kind` is the free-form text in InsuranceDetails.insurance_type.
 *
 * v0.8.0 only ships SavingsView; protection / car fall through to the legacy
 * detail layout.
 *
 * Display labels for kind / payCycle live in i18n dictionaries (assetDetail.insurance.kindLabels
 * / payCycleLabels) — see InsuranceDetailClientLegacy & SavingsView for inline lookup helpers.
 */

export type FramingGroup = 'savings' | 'protection' | 'car'

export function getFramingGroup(kind: string | null | undefined): FramingGroup {
  if (kind === 'savings') return 'savings'
  if (kind === 'car') return 'car'
  return 'protection'
}

/** Months between consecutive premium payments. Defaults to annual when unset. */
export function payCycleMonths(payCycle: string | null | undefined): number {
  switch (payCycle) {
    case 'monthly': return 1
    case 'quarterly': return 3
    case 'semi': return 6
    default: return 12
  }
}

/**
 * Add `months` to `date`. If the target month has fewer days than the source
 * day-of-month (Jan 31 + 1 month → Feb 28), clamps to the last day of the
 * target month rather than overflowing into the next month.
 */
function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(date.getDate(), lastDay))
  return d
}

/**
 * Compute the next premium payment date for a multi-period policy.
 *
 * Anchored on `startsAt` + payCycle: payments fall on startsAt, startsAt+1cycle,
 * startsAt+2cycle... up to (but not past) `termYears` total years. Returns the
 * first such date strictly after `today`, or null when:
 *   - startsAt is missing
 *   - the term has ended (today is past startsAt + termYears years)
 *
 * Today equal to a payment date counts as "already paid" — next payment is the
 * one after that. Past-due (skipped) payments don't surface as next; we always
 * return a future date.
 */
export function computeNextPaymentDate(
  startsAt: Date | null,
  payCycle: string | null | undefined,
  termYears: number,
  today: Date,
): Date | null {
  if (!startsAt) return null
  const cycleMonths = payCycleMonths(payCycle)
  const termMonths = termYears > 0 ? termYears * 12 : Number.POSITIVE_INFINITY

  for (let n = 0; n * cycleMonths < termMonths; n++) {
    const candidate = addMonthsClamped(startsAt, n * cycleMonths)
    if (candidate.getTime() > today.getTime()) return candidate
    // Safety guard — shouldn't happen with sane term lengths, but bound the loop.
    if (n > 12_000) return null
  }
  return null
}
