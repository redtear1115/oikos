export interface SettlementChip {
  label: string
  value: number
}

/**
 * Quick-pick chip values for partial settlement.
 * D = current debt amount (positive). Returns [全額, 一半, 整數].
 * 整數 is hidden if it equals 全額 or if D < 100.
 */
export function settlementChips(debt: number): SettlementChip[] {
  if (debt <= 0) return []

  const full = debt
  const half = Math.ceil(debt / 2)

  // 整數: round to nearest 100 ≤ debt
  let round = Math.round(debt / 100) * 100
  if (round > debt) round = Math.floor(debt / 100) * 100

  const chips: SettlementChip[] = [
    { label: '全額', value: full },
    { label: '一半', value: half },
  ]
  if (round >= 100 && round !== full) {
    chips.push({ label: '整數', value: round })
  }
  return chips
}
