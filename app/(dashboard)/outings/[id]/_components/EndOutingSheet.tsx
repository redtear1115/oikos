'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { endOuting } from '@/actions/outing'

interface Props {
  open: boolean
  outingId: string
  onClose: () => void
  onSaved?: () => void
}

export function EndOutingSheet({ open, outingId, onClose, onSaved }: Props) {
  const t = useTranslations()
  const to = t.outing
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const handleSave = () => {
    setError('')
    startTransition(async () => {
      try {
        unwrapAction(await endOuting({ outingId }))
        onSaved?.()
        onClose()
        router.refresh()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={to.endConfirmTitle}
      canSave={!pending}
      pending={pending}
      bottomSaveLabel={to.form.confirmEnd}
      error={error}
      onClose={onClose}
      onSave={handleSave}
      destructive
    >
      <div className="px-5 pt-2 pb-4">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{to.endConfirmBody}</p>
      </div>
    </SheetShell>
  )
}
