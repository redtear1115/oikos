'use client'

import { useTranslations } from '@/lib/i18n/client'
import { SegmentedToggle, type SegmentedOption } from '@/components/ui/SegmentedToggle'

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
  // Selected fill matches the avatar colour so the chip and the avatar above
  // the page header read as the same person at a glance.
  const options: SegmentedOption[] = [
    { id: 'left', label: leftLabel, active: selected.has('left'), onClick: () => toggle('left'), fillColor: viewerColor },
    { id: 'right', label: rightLabel, active: selected.has('right'), onClick: () => toggle('right'), fillColor: partnerColor },
  ]
  return <SegmentedToggle options={options} size="sm" />
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
