'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/client'
import { PayerDualToggle, SplitDualToggle } from './MemberDualToggle'
import type { DashboardPayer, DashboardSplit } from './useDashboardReducer'

interface DashboardFilterRowProps {
  payerFilter: DashboardPayer
  splitFilter: DashboardSplit
  onPayerChange: (next: DashboardPayer) => void
  onSplitChange: (next: DashboardSplit) => void
  viewerIsA: boolean
  t: ReturnType<typeof useTranslations>
}

/**
 * L3 filter row, distilled. At rest it's a single 「篩選」chip, so the feed
 * isn't pushed down by a standing control band. Tapping the chip reveals the
 * payer (誰付) + split (誰負擔) dual-toggles inline; an active filter keeps
 * them revealed and fills the chip with ink + a dot so the state stays visible
 * even when the user hasn't expanded it. Mirrors the /records 篩選 chip's
 * filled-when-active treatment. Caller gates this on `!isSolo && partner`.
 */
export function DashboardFilterRow({
  payerFilter,
  splitFilter,
  onPayerChange,
  onSplitChange,
  viewerIsA,
  t,
}: DashboardFilterRowProps) {
  const [open, setOpen] = useState(false)
  const hasActiveFilter = payerFilter !== 'all' || splitFilter !== 'all'
  // Active filters force the toggles open so they're always adjustable; an
  // explicit tap opens them when nothing is filtered yet.
  const showToggles = open || hasActiveFilter

  return (
    <div
      className="flex items-center gap-2 px-5 pb-2 overflow-x-auto"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={showToggles}
        aria-label={t.dashboard.filterAriaLabel}
        className="h-8 px-3 rounded-full text-sm flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer transition-colors duration-150"
        style={{
          background: hasActiveFilter ? 'var(--ink)' : 'var(--surface)',
          color: hasActiveFilter ? 'var(--on-fill)' : 'var(--ink-2)',
          border: hasActiveFilter ? 'none' : '1px solid var(--hairline)',
        }}
      >
        {t.dashboard.filterLabel}
        {hasActiveFilter && (
          <span
            aria-hidden
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--on-fill)', flexShrink: 0 }}
          />
        )}
      </button>

      {showToggles && (
        <>
          <PayerDualToggle
            value={payerFilter}
            onChange={onPayerChange}
            viewerIsA={viewerIsA}
            t={t}
          />
          <SplitDualToggle
            value={splitFilter}
            onChange={onSplitChange}
            viewerIsA={viewerIsA}
            t={t}
          />
        </>
      )}
    </div>
  )
}
