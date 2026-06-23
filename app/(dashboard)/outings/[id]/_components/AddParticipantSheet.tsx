'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { addOutingParticipant } from '@/actions/outing'
import { Field } from './sheetBits'

interface Props {
  open: boolean
  outingId: string
  onClose: () => void
  onSaved?: () => void
}

export function AddParticipantSheet({ open, outingId, onClose, onSaved }: Props) {
  const t = useTranslations()
  const f = t.outing.form
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const canSave = name.trim().length > 0

  const handleSave = () => {
    setError('')
    startTransition(async () => {
      try {
        await addOutingParticipant({ outingId, displayName: name.trim() })
        onSaved?.()
        setName('')
        onClose()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={t.outing.addParticipant}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={f.saveParticipant}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      <div className="px-5 pt-2 pb-4">
        <Field label={f.participantNameLabel}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={f.participantNamePlaceholder}
            maxLength={50}
            autoFocus
          />
        </Field>
      </div>
    </SheetShell>
  )
}
