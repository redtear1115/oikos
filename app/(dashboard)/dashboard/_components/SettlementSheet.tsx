'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { CalIcon, Chevron } from '@/app/(dashboard)/_components/sheet-icons'
import { PayerToggle } from './PayerToggle'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { SheetBody, SheetFooter } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
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
        {/* 3-column header (cancel | title | save) — SheetHeader primitive is
            2-column (title + single trailing), so we keep a custom wrapper
            and use Button primitives for the actions. Mirrors the pilot
            InstallGuide pattern. */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2">
          <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
            {t.common.cancel}
          </Button>
          <div className="text-base font-medium tracking-wide" style={{ color: 'var(--ink)' }}>
            {t.settlement.editTitle}
          </div>
          {/* Past-epoch view is read-only — hide save. The sheet itself shouldn't
              open in past view (parent gates onItemClick), but keep this as a
              belt-and-braces guard. */}
          {isPast ? (
            <div className="w-10" aria-hidden="true" />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={!amount || pending}
              aria-busy={pending}
              className="px-2 font-medium"
              style={{ color: amount && !pending ? 'var(--accent)' : undefined }}
            >
              {pending ? t.common.saving : t.common.save}
            </Button>
          )}
        </div>

        <SheetBody noPadding>
          {/* Amount + payer */}
          <div className="px-6 pt-6 pb-7 text-center border-b border-hairline">
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
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-bubble cursor-pointer text-left"
              style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
              <CalIcon />
              <div className="flex-1 text-left">
                <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
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

          {/* In past-epoch (read-only) view there is no footer — preserve
              bottom breathing room past the iOS home indicator. */}
          {isPast && (
            <div style={{ height: 'calc(24px + env(safe-area-inset-bottom))' }} />
          )}
        </SheetBody>

        {/* Delete lives in the footer — SheetFooter handles safe-area-inset-bottom. */}
        {!isPast && (
          <SheetFooter>
            <Button
              variant="danger"
              fullWidth
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
            >
              {t.settlement.deleteOne}
            </Button>
          </SheetFooter>
        )}
      </SheetFrame>

      {error && open && (
        <div
          className="fixed left-1/2 top-4 z-modal -translate-x-1/2 w-[calc(100%-32px)] max-w-[calc(28rem-32px)] px-4 py-3 rounded-xl text-sm text-white"
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
