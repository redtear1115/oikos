'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { createOuting } from '@/actions/outing'

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

export function OutingSheet({ open, onClose, onSaved }: Props) {
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
        const outing = await createOuting({ name: name.trim() })
        onSaved?.()
        setName('')
        onClose()
        router.push(`/outings/${outing.id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={t.outingList.addCta}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={f.saveCreate}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      <div className="px-5 pt-2 pb-4 flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>{f.nameLabel}</label>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={f.namePlaceholder}
          maxLength={100}
          autoFocus
        />
      </div>
    </SheetShell>
  )
}
