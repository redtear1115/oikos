'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { currencyPrecision } from '@/lib/currency'
import { recordOutingSettlement } from '@/actions/outing'
import { Field, ChipRow, Chip } from './sheetBits'

interface Props {
  open: boolean
  outingId: string
  currency: string
  participants: { id: string; displayName: string }[]
  onClose: () => void
  onSaved?: () => void
}

export function SettleSheet({ open, outingId, currency, participants, onClose, onSaved }: Props) {
  const t = useTranslations()
  const f = t.outing.form
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const parsedAmount = Number(amountRaw)
  const amountValid = amountRaw.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0
  const canSave = !!from && !!to && from !== to && amountValid

  const handleSave = () => {
    setError('')
    const precision = currencyPrecision(currency)
    const amount = precision === 2 ? Math.round(parsedAmount * 100) : Math.round(parsedAmount)
    startTransition(async () => {
      try {
        await recordOutingSettlement({ outingId, fromParticipantId: from, toParticipantId: to, amount })
        onSaved?.()
        setFrom(''); setTo(''); setAmountRaw('')
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
      title={t.outing.settle}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={f.saveSettle}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      <div className="px-5 pt-2 pb-4 flex flex-col gap-5">
        <Field label={f.settleFromLabel}>
          <ChipRow>
            {participants.map((p) => (
              <Chip key={p.id} selected={from === p.id} onClick={() => setFrom(p.id)}>{p.displayName}</Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={f.settleToLabel}>
          <ChipRow>
            {participants.map((p) => (
              <Chip key={p.id} selected={to === p.id} onClick={() => setTo(p.id)}>{p.displayName}</Chip>
            ))}
          </ChipRow>
        </Field>
        <Field label={f.settleAmountLabel}>
          <TextInput value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} inputMode="decimal" placeholder="0" />
        </Field>
      </div>
    </SheetShell>
  )
}
