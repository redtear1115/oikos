/**
 * Shared icons for AddSheet / SettlementSheet / SettlementForm.
 *
 * Previously duplicated inline in each sheet — Chevron was identical, CalIcon
 * was nearly identical (one used 20px viewBox, others 22). Consolidating here
 * with explicit `size` props lets each call site pick the size it needs without
 * forking the geometry.
 */

interface SizedIcon {
  size?: number
}

export function DescIcon({ size = 22 }: SizedIcon = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 6h14M4 11h14M4 16h9" stroke="#9A9085" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function CalIcon({ size = 22 }: SizedIcon = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="16" height="14" rx="3" stroke="#5C544A" strokeWidth="1.5" />
      <path d="M3 9h16" stroke="#5C544A" strokeWidth="1.5" />
      <path d="M7 3v4M15 3v4" stroke="#5C544A" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function Chevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 7 12" fill="none" aria-hidden="true">
      <path d="M1 1l5 5-5 5" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
