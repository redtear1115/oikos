'use client'

import { useState } from 'react'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { useTranslations } from '@/lib/i18n/client'

/** Settings row that opens the platform-aware install guide sheet. The sheet's
 * open/close state is the only reason this corner of the page needs client. */
export function InstallGuideRow() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-5 py-4 rounded-card text-left bg-transparent cursor-pointer"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t.settings.addToHomeScreen}
          </div>
        </div>
        <div className="text-sm flex items-center gap-2 shrink-0" style={{ color: 'var(--ink-3)' }}>
          <span aria-hidden="true">›</span>
        </div>
      </button>

      <InstallGuide open={open} onClose={() => setOpen(false)} t={t} />
    </>
  )
}
