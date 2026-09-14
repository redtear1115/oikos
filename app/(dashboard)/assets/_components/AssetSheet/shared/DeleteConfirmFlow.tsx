'use client'

import { useState } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  pending: boolean
  onDelete: () => void
}

// Used by every *SheetBody in edit mode. Renders the bottom delete button
// plus its confirm modal.
//
// Position in the JSX tree MATTERS — there is no portal (ConfirmModal has no
// createPortal). This component must stay INSIDE the SheetFrame panel, and
// something focusable must still follow it in DOM order (today: SheetShell's
// bottom save button). Both conditions are what keep keyboard focus working:
// SheetFrame's useFocusTrap then sees the modal's buttons as inside its own
// panel and leaves them alone, so ConfirmModal's own trap does the cycling.
//
// Move this outside the panel and it becomes a sibling of </SheetFrame>, which
// puts two focus traps on window fighting over every Tab — the failure mode
// AddSheet / IncomeSheet / SettlementSheet / RecurringRuleSheet / NewFuelLog
// are in today: Tab is swallowed and the Confirm button is pointer-only.
// See #1171 (verifier F1) and #1176.
export function DeleteConfirmFlow({ pending, onDelete }: Props) {
  const t = useTranslations()
  const ts = t.assetSheet
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button
        type="button"
        className="mt-3 w-full py-3 rounded-bubble text-sm font-medium cursor-pointer border-0"
        style={{ background: 'var(--surface)', color: 'var(--destructive)' }}
        onClick={() => setConfirming(true)}
      >
        {t.common.delete}
      </button>
      <ConfirmModal
        open={confirming}
        title={ts.deleteConfirm.title}
        description={ts.deleteConfirm.description}
        confirmLabel={ts.deleteConfirm.confirmLabel}
        pending={pending}
        onConfirm={() => { setConfirming(false); onDelete() }}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
