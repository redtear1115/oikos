import type { AssetWithCar } from '@/lib/db/queries/asset'

export type BadgeTone = 'destructive' | 'warning' | 'saving' | 'accent' | 'active'

export interface AssetBadge {
  tone: BadgeTone
  label: string
}

/**
 * Derive badge for an insurance asset in list/switcher contexts.
 * Returns null when no alertable condition exists.
 */
export function deriveInsuranceBadge(ins: AssetWithCar, today: Date): AssetBadge | null {
  if (!ins.insuranceExpiryDate) return null
  const msToExpiry = new Date(ins.insuranceExpiryDate).getTime() - today.getTime()
  const daysToExpiry = Math.round(msToExpiry / 86400000)
  const reminder = ins.insuranceReminderDaysBefore ?? 30

  if (daysToExpiry < 0) return { tone: 'destructive', label: '逾期' }
  if (daysToExpiry <= reminder) return { tone: 'destructive', label: `${daysToExpiry} 天` }
  return null
}

/**
 * Derive badge for a car asset: checks if any linked insurance is expiring soon.
 * `allInsurances` should be the full asset list filtered to type === 'insurance'.
 */
export function deriveCarInsuranceBadge(
  carId: string,
  allInsurances: AssetWithCar[],
  today: Date,
): AssetBadge | null {
  const linked = allInsurances.filter(i => i.insuranceVehicleId === carId)
  for (const ins of linked) {
    const badge = deriveInsuranceBadge(ins, today)
    if (badge) return { tone: 'destructive', label: `保單 ${badge.label}` }
  }
  return null
}

/**
 * Compute a one-line subtitle for an insurance asset row in the switcher.
 * Format follows the README spec:
 *   protection one-year: "{insurer} · {N}天到期" or "{insurer} · 已到期"
 *   protection multi-year / savings: "{insurer} · {passed}/{term} 年期"
 */
export function insuranceSubtitle(ins: AssetWithCar, framingGroup: 'savings' | 'protection' | 'car', today: Date): string {
  const parts: string[] = []
  if (ins.insuranceInsurer) parts.push(ins.insuranceInsurer)

  if (framingGroup === 'protection' && (ins.insuranceTermYears ?? 0) <= 1 && ins.insuranceExpiryDate) {
    const days = Math.round((new Date(ins.insuranceExpiryDate).getTime() - today.getTime()) / 86400000)
    parts.push(days < 0 ? '已到期' : `${days}天到期`)
  } else if (ins.insuranceTermYears && ins.insuranceStartsAt) {
    const yearsFromStart = (today.getTime() - new Date(ins.insuranceStartsAt).getTime()) / (365.25 * 86400000)
    const yearsPassed = Math.max(0, Math.floor(yearsFromStart))
    parts.push(`${yearsPassed}/${ins.insuranceTermYears} 年期`)
  }

  return parts.join(' · ')
}
