'use client'

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
 * L3 filter row — two avatar-coloured dual-toggle pills: payer (誰付) +
 * split (誰負擔). Both share the same visual / interaction. Caller gates
 * this on `!isSolo && partner` — solo mode has nothing useful in either
 * dim (only one person, no real split decisions).
 */
export function DashboardFilterRow({
  payerFilter,
  splitFilter,
  onPayerChange,
  onSplitChange,
  viewerIsA,
  t,
}: DashboardFilterRowProps) {
  return (
    <div
      className="flex items-center gap-2 px-5 pb-2 overflow-x-auto"
      style={{ scrollbarWidth: 'none' } as React.CSSProperties}
    >
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
    </div>
  )
}
