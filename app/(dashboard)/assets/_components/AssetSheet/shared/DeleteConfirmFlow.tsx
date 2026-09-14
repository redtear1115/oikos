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
// Position in the JSX tree no longer matters. This comment used to require
// the component to stay inside the SheetFrame panel, on the reasoning that
// SheetFrame's focus trap would then leave the modal's buttons alone. That
// reasoning is retracted: inside the panel, the panel's `transform` became
// the containing block for the modal's `position: fixed`, so the modal centred
// on the sheet rather than the viewport (#1204). ConfirmModal now portals to
// `document.body`, and useFocusTrap keeps a stack so only the topmost trap
// handles Tab (#1176) — both placements are safe.
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
