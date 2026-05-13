'use client'

import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { GatedView } from '@/app/(dashboard)/_components/GatedView'

/**
 * #227 — Rendered when an insurance asset detail page is reached while Guardian
 * (Beta) is off (stale URL / bookmark / shared link). Replaces the previous
 * `redirect('/dashboard')` so the user sees a clear "go to Settings" prompt
 * in-place instead of being silently bounced.
 */
export function InsuranceGatedClient() {
  return (
    <div className="relative min-h-screen pb-[92px]" style={{ background: 'var(--bg)' }}>
      <div className="pt-[60px]">
        <GatedView />
      </div>
      {/* FAB has nothing to add on this gated surface — keep the nav, hide the
          FAB. onAddClick is a no-op for the same reason. */}
      <BottomNav onAddClick={() => undefined} hideFab />
    </div>
  )
}
