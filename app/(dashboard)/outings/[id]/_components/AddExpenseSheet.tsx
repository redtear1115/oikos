'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { currencyPrecision } from '@/lib/currency'
import { addOutingExpense } from '@/actions/outing'
import { Field, ChipRow, Chip } from './sheetBits'

interface Props {
  open: boolean
  outingId: string
  currency: string
  participants: { id: string; displayName: string }[]
  onClose: () => void
  onSaved?: () => void
}

export function AddExpenseSheet({ open, outingId, currency, participants, onClose, onSaved }: Props) {
  const t = useTranslations()
  const f = t.outing.form
  const router = useRouter()
  const [payer, setPayer] = useState<string>('')
  const [amountRaw, setAmountRaw] = useState('')
  const [selected, setSelected] = useState<string[]>(participants.map((p) => p.id))
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  // Preselect everyone each time the sheet opens, not once at mount: someone
  // added after the page loaded would otherwise start unticked (#1396).
  // Adjusted during render on the closed→open edge, so the first open frame
  // already shows the fresh selection.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(participants.map((p) => p.id))
  }

  const parsedAmount = Number(amountRaw)
  const amountValid = amountRaw.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0
  const canSave = !!payer && amountValid && selected.length > 0

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const handleSave = () => {
    setError('')
    const precision = currencyPrecision(currency)
    const amount = precision === 2 ? Math.round(parsedAmount * 100) : Math.round(parsedAmount)
    startTransition(async () => {
      try {
        unwrapAction(await addOutingExpense({
          outingId,
          paidByParticipantId: payer,
          amount,
          participantIds: selected,
          description: description.trim() || undefined,
        }))
        onSaved?.()
        setAmountRaw(''); setDescription(''); setPayer('')
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
      title={t.outing.addExpense}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={f.saveExpense}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      <div className="px-5 pt-2 pb-4 flex flex-col gap-5">
        <Field label={f.payerLabel}>
          <ChipRow>
            {participants.map((p) => (
              <Chip key={p.id} selected={payer === p.id} onClick={() => setPayer(p.id)}>{p.displayName}</Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={f.amountLabel}>
          <TextInput
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </Field>

        <Field label={f.splitLabel}>
          <ChipRow>
            {participants.map((p) => (
              <Chip key={p.id} selected={selected.includes(p.id)} onClick={() => toggle(p.id)}>{p.displayName}</Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={f.descriptionLabel}>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={100} />
        </Field>
      </div>
    </SheetShell>
  )
}
