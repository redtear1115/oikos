'use client'

import { useTranslations } from '@/lib/i18n/client'

type Side = 'left' | 'right'

interface MemberDualToggleProps {
  /** Selection state. Must be non-empty — component enforces ≥1. `left`
   *  = viewer's side (avatar-coloured by viewer role), `right` = partner's
   *  side (the opposite role's avatar colour). */
  selected: Set<Side>
  onChange: (next: Set<Side>) => void
  /** Same source of truth as `<Avatar memberRole=…/>` — drives which side
   *  gets `var(--ink)` (role 'a') vs `var(--accent)` (role 'b'). */
  viewerIsA: boolean
  leftLabel: string
  rightLabel: string
}

/**
 * Two-pill toggle keyed by member side. Used by both the payer (誰付)
 * and split (誰負擔) L3 dimensions — they have the same shape: two
 * member-coloured pills, both-selected = no filter, single-selected
 * narrows to that member, zero-selected is disallowed. Selected fill
 * matches the avatar colour so the chip and the avatar above the page
 * header read as the same person at a glance.
 */
function MemberDualToggle({
  selected,
  onChange,
  viewerIsA,
  leftLabel,
  rightLabel,
}: MemberDualToggleProps) {
  const toggle = (side: Side) => {
    const next = new Set(selected)
    if (next.has(side)) {
      if (next.size === 1) return
      next.delete(side)
    } else {
      next.add(side)
    }
    onChange(next)
  }
  const viewerColor = viewerIsA ? 'var(--ink)' : 'var(--accent)'
  const partnerColor = viewerIsA ? 'var(--accent)' : 'var(--ink)'
  return (
    <div
      className="inline-flex items-center shrink-0"
      style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--hairline)',
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}
    >
      {([
        { side: 'left' as Side, label: leftLabel, color: viewerColor },
        { side: 'right' as Side, label: rightLabel, color: partnerColor },
      ]).map(({ side, label, color }) => {
        const sel = selected.has(side)
        return (
          <button
            key={side}
            type="button"
            onClick={() => toggle(side)}
            className="inline-flex items-center cursor-pointer border-0 text-xs font-medium transition-colors duration-150"
            style={{
              height: 22,
              padding: '0 10px',
              borderRadius: 999,
              background: sel ? color : 'transparent',
              color: sel ? 'var(--on-fill)' : 'var(--ink-3)',
            }}
            aria-pressed={sel}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

interface PayerDualToggleProps {
  value: 'all' | 'me' | 'partner'
  onChange: (next: 'all' | 'me' | 'partner') => void
  viewerIsA: boolean
  t: ReturnType<typeof useTranslations>
}

export function PayerDualToggle({ value, onChange, viewerIsA, t }: PayerDualToggleProps) {
  const selected: Set<Side> =
    value === 'all'
      ? new Set<Side>(['left', 'right'])
      : new Set<Side>([value === 'me' ? 'left' : 'right'])
  const handleChange = (next: Set<Side>) => {
    onChange(
      next.size === 2 ? 'all' : next.has('left') ? 'me' : 'partner',
    )
  }
  return (
    <MemberDualToggle
      selected={selected}
      onChange={handleChange}
      viewerIsA={viewerIsA}
      leftLabel={t.common.me}
      rightLabel={t.common.partner}
    />
  )
}

interface SplitDualToggleProps {
  value: 'all' | 'mine' | 'theirs'
  onChange: (next: 'all' | 'mine' | 'theirs') => void
  viewerIsA: boolean
  t: ReturnType<typeof useTranslations>
}

/**
 * Split-type dual-toggle. 「我負擔」+「對方負擔」collapse to `'all'`
 * when both selected (the feed then shows ratio-based half / weighted
 * records too — those modes are intentionally NOT pickable on their
 * own from L3; only visible when the dim is unfiltered).
 */
export function SplitDualToggle({ value, onChange, viewerIsA, t }: SplitDualToggleProps) {
  const selected: Set<Side> =
    value === 'all'
      ? new Set<Side>(['left', 'right'])
      : new Set<Side>([value === 'mine' ? 'left' : 'right'])
  const handleChange = (next: Set<Side>) => {
    onChange(
      next.size === 2 ? 'all' : next.has('left') ? 'mine' : 'theirs',
    )
  }
  return (
    <MemberDualToggle
      selected={selected}
      onChange={handleChange}
      viewerIsA={viewerIsA}
      leftLabel={t.dashboard.burdenMe}
      rightLabel={t.dashboard.burdenPartner}
    />
  )
}
