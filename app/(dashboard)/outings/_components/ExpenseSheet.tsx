'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SheetShell } from '@/app/(dashboard)/assets/_components/AssetSheet/shared/SheetShell'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { useTranslations } from '@/lib/i18n/client'
import { unwrapAction } from '@/lib/action-errors'
import { describeError } from '@/lib/errors'
import { currencyPrecision } from '@/lib/currency'
import { addOutingExpense, deleteOutingExpense, editOutingExpense } from '@/actions/outing'
import { Field, ChipRow, Chip } from './sheetBits'

export interface ExpenseSheetParticipant {
  id: string
  displayName: string
  /** False once deactivated: kept on expenses they were on, never offered for a new one. */
  active: boolean
}

export interface ExpenseSheetExpense {
  id: string
  paidByParticipantId: string
  amount: number
  description: string | null
  category: string | null
  shares: { participantId: string }[]
}

interface Props {
  open: boolean
  outingId: string
  currency: string
  participants: ExpenseSheetParticipant[]
  /** The expense to edit; omitted or null adds a new one. */
  expense?: ExpenseSheetExpense | null
  onClose: () => void
  onSaved?: () => void
}

/**
 * Add, edit or delete one outing expense (#943, #1558). Shared by the
 * dashboard detail page and the public outing page: it reads nothing from the
 * dashboard (no member / viewer context) and calls the outing actions, which
 * resolve the caller themselves — a member by session, a friend by session or
 * claim cookie. Needs only a TranslationsProvider above it.
 *
 * Who can be picked: active participants, plus — when editing — anyone
 * already on the expense, even if deactivated since (editOutingExpense keeps
 * them; dropping them silently would rewrite history on a typo fix).
 */
export function ExpenseSheet({ open, outingId, currency, participants, expense = null, onClose, onSaved }: Props) {
  const t = useTranslations()
  const to = t.outing
  const f = to.form
  const router = useRouter()
  const editing = expense !== null
  const precision = currencyPrecision(currency)

  const [payer, setPayer] = useState('')
  const [amountRaw, setAmountRaw] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, startDelete] = useTransition()

  const activeIds = participants.filter((p) => p.active).map((p) => p.id)

  // Seed the form on each closed→open edge, not once at mount: someone added
  // after the page loaded would otherwise start unticked (#1396), and the
  // same sheet instance opens on different expenses. Adjusted during render,
  // so the first open frame already shows the right values. A new expense
  // keeps the payer / amount / note typed before an unsaved close.
  const [wasOpen, setWasOpen] = useState(false)
  const [seededEdit, setSeededEdit] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && expense) {
      setPayer(expense.paidByParticipantId)
      setAmountRaw(String(precision === 2 ? expense.amount / 100 : expense.amount))
      setSelected(expense.shares.map((s) => s.participantId))
      setDescription(expense.description ?? '')
      setSeededEdit(true)
      setError('')
    } else if (open) {
      if (seededEdit) {
        setPayer(''); setAmountRaw(''); setDescription(''); setSeededEdit(false)
      }
      setSelected(activeIds)
      setError('')
    }
  }

  const onExpense = new Set(expense ? [expense.paidByParticipantId, ...expense.shares.map((s) => s.participantId)] : [])
  const pickable = participants.filter((p) => p.active || onExpense.has(p.id))

  const parsedAmount = Number(amountRaw)
  const amountValid = amountRaw.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0
  const canSave = !!payer && amountValid && selected.length > 0 && !pending

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const done = () => {
    onSaved?.()
    onClose()
    router.refresh()
  }

  const handleSave = () => {
    setError('')
    const amount = precision === 2 ? Math.round(parsedAmount * 100) : Math.round(parsedAmount)
    const fields = {
      outingId,
      paidByParticipantId: payer,
      amount,
      participantIds: selected,
      description: description.trim() || undefined,
    }
    startTransition(async () => {
      try {
        if (expense) {
          unwrapAction(await editOutingExpense({ ...fields, expenseId: expense.id, category: expense.category }))
          setSeededEdit(false)
        } else {
          unwrapAction(await addOutingExpense(fields))
        }
        setAmountRaw(''); setDescription(''); setPayer('')
        done()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  const handleDelete = () => {
    if (!expense) return
    setDeleteError('')
    startDelete(async () => {
      try {
        unwrapAction(await deleteOutingExpense({ outingId, expenseId: expense.id }))
        setConfirmingDelete(false)
        setSeededEdit(false)
        setAmountRaw(''); setDescription(''); setPayer('')
        done()
      } catch (e) {
        setDeleteError(describeError(e, t.common.error, t.common.offlineError, t.errors.actions))
      }
    })
  }

  return (
    <SheetShell
      open={open}
      title={editing ? to.editExpense : to.addExpense}
      canSave={canSave}
      pending={pending}
      bottomSaveLabel={editing ? t.common.update : f.saveExpense}
      error={error}
      onClose={onClose}
      onSave={handleSave}
    >
      <div className="px-5 pt-2 pb-4 flex flex-col gap-5">
        <Field label={f.payerLabel}>
          <ChipRow>
            {pickable.map((p) => (
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
            {pickable.map((p) => (
              <Chip key={p.id} selected={selected.includes(p.id)} onClick={() => toggle(p.id)}>{p.displayName}</Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label={f.descriptionLabel}>
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} maxLength={100} />
        </Field>

        {editing && (
          <Button variant="ghost" onClick={() => { setDeleteError(''); setConfirmingDelete(true) }}>
            {to.deleteExpense}
          </Button>
        )}
      </div>

      <ConfirmModal
        open={confirmingDelete}
        title={to.deleteExpenseConfirmTitle}
        description={to.deleteExpenseConfirmBody}
        confirmLabel={t.common.delete}
        pending={deleting}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      >
        {deleteError && <p role="alert" className="text-sm mb-4 text-[var(--debit-text)]">{deleteError}</p>}
      </ConfirmModal>
    </SheetShell>
  )
}
