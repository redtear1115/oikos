'use client'

import { useState } from 'react'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  pending: boolean
  onDelete: () => void
}

// Used by every *SheetBody in edit mode. Renders the bottom delete button
// plus its confirm modal. Modal mounts via portal so its position in the JSX
// tree doesn't matter.
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
