export interface ShareAllocation {
  participantId: string
  shareAmount: number
}

/**
 * Equal-split an integer amount across participants.
 * Remainder cents go one-each to the lowest participant ids first
 * (deterministic, input-order independent). Invariant: Σ shareAmount === amount.
 */
export function splitEqual(amount: number, participantIds: string[]): ShareAllocation[] {
  if (participantIds.length === 0) {
    throw new Error('splitEqual: need at least one participant')
  }
  const sorted = [...participantIds].sort()
  const n = sorted.length
  const base = Math.floor(amount / n)
  let remainder = amount - base * n
  return sorted.map((participantId) => {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    return { participantId, shareAmount: base + extra }
  })
}
