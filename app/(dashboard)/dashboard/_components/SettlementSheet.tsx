'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { PayerToggle } from './PayerToggle'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { AmountInput } from '@/app/(dashboard)/_components/AmountInput'
import { MiniCalendar } from './MiniCalendar'
import { editSettlement, softDeleteSettlement } from '@/actions/settlement'
import { localTodayISO } from '@/lib/local-date'
import { formatDateAbsolute, formatPickerSubtitle } from '@/lib/format-date'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

export interface SettlementSheetInitial {
  id: string
  amount: number
  payerId: string
  settledAt: string  // ISO
}

interface Props {
  open: boolean
  onClose: () => void
  initial: SettlementSheetInitial | null
  onMutated?: (info?: { savedAmount?: number; edit?: boolean; deleted?: boolean }) => void
}

export function SettlementSheet({ open, onClose, initial, onMutated }: Props) {
  const { viewer, partner, isPast } = useMember()
  const locale = useLocale()
  const t = useTranslations()
  const [amount, setAmount] = useState('')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [showCal, setShowCal] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !initial) return
    setAmount(String(initial.amount))
    setPayerWho(initial.payerId === viewer.id ? 'M' : 'T')
    // Use local Y/M/D components for prefill so a UTC-noon stored date displays as the
    // user's intended date in the picker.
    const dt = new Date(initial.settledAt)
    setDate(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    setShowCal(false)
    setError('')
  }, [open, initial, viewer.id])

  useFocusAndSelectOnOpen(open, amountInputRef)

  const handleSave = () => {
    if (!initial) return
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError(t.settlement.errors.amountRequired); return }
    if (payerWho === 'T' && !partner) { setError(t.settlement.errors.noPartner); return }
    const payerId = payerWho === 'M' ? viewer.id : partner!.id
    startTransition(async () => {
      try {
        await editSettlement({
          oldId: initial.id,
          amount: n,
          payerId,
          settledAt: date,
        })
        onMutated?.({ savedAmount: n, edit: true })
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const performDelete = () => {
    if (!initial) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteSettlement(initial.id)
        onMutated?.({ deleted: true })
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  return (
    <>
      <SheetFrame open={open} onClose={onClose} ariaLabel={t.settlement.editTitle}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button onClick={onClose}
            className="bg-transparent border-0 text-body cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}>{t.common.cancel}</button>
          <div className="text-base font-semibold tracking-wide" style={{ color: 'var(--ink)' }}>
            {t.settlement.editTitle}
          </div>
          {/* Past-epoch view is read-only — hide save. The sheet itself shouldn't
              open in past view (parent gates onItemClick), but keep this as a
              belt-and-braces guard. */}
          {!isPast && (
            <button onClick={handleSave} disabled={!amount || pending}
              className="bg-transparent border-0 text-body font-semibold p-1 cursor-pointer disabled:cursor-default"
              style={{ color: amount && !pending ? 'var(--accent)' : 'var(--ink-3)' }}>
              {pending ? t.common.saving : t.common.save}
            </button>
          )}
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount + payer */}
          <div className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] mb-3" style={{ color: 'var(--ink-3)' }}>
              {t.settlement.amountLabel}
            </div>
            <AmountInput
              value={amount}
              onChange={setAmount}
              symbol="NT$"
              ariaLabel={t.settlement.amountAriaLabel}
              inputRef={amountInputRef}
            />

            <PayerToggle value={payerWho} onChange={setPayerWho} />
          </div>

          {/* Date */}
          <div className="px-5 pt-1 pb-6">
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              {t.settlement.dateLabel}
            </div>
            <button onClick={() => setShowCal(v => !v)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] cursor-pointer text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              <CalIcon />
              <div className="flex-1 text-left">
                <div className="text-body font-medium" style={{ color: 'var(--ink)' }}>
                  {formatDateAbsolute(date, locale)}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                  {formatPickerSubtitle(date, locale)}
                </div>
              </div>
              <Chevron />
            </button>
            {showCal && <MiniCalendar value={date} onChange={d => { setDate(d); setShowCal(false) }} />}
          </div>

          {/* Delete — hidden in past-epoch view */}
          {!isPast && (
            <div className="px-5 pb-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="w-full h-12 rounded-[14px] border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: 'var(--destructive)',
                  border: '1px solid var(--destructive-soft)',
                }}
              >
                {t.settlement.deleteOne}
              </button>
            </div>
          )}

          {/* Extend past the iOS home indicator (env safe-area-inset-bottom). */}
          <div style={{ height: 'calc(24px + env(safe-area-inset-bottom))' }} />
        </div>
      </SheetFrame>

      {error && open && (
        <div
          className="fixed left-1/2 top-4 z-[110] -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
          style={{ background: 'var(--debit)' }}
        >
          {error}
        </div>
      )}

      <ConfirmModal
        open={confirmingDelete && open}
        title={t.settlement.deleteConfirmTitle}
        description={t.common.deleteSoftDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}
