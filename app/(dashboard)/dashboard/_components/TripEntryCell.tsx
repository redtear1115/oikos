'use client'

import { useTranslations } from '@/lib/i18n/client'
import { ContinuityCell } from './ContinuityCell'

/**
 * Where the dashboard's 旅行 cell goes (#1364).
 *
 * Deliberately one constant behind its own component: 旅行 and 出遊 are to
 * share a single entry (#870 / #943, group-outing-design.md「與旅行的界線」),
 * and how that entry routes between the two is not decided yet. Until it is,
 * the cell points at /trips — which itself carries the row into 出遊 — and
 * this file is the only thing that changes when the combined entry lands.
 */
export const TRIP_ENTRY_HREF = '/trips'

/** State D of the wireframe: no active trip. With an active trip the cell is not rendered (option α). */
export function TripEntryCell() {
  const t = useTranslations()
  const c = t.dashboard.continuity
  return (
    <ContinuityCell
      href={TRIP_ENTRY_HREF}
      title={c.tripTitle}
      subtitle={c.tripEmpty}
      ariaLabel={c.tripAria}
    />
  )
}
