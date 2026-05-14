'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetBackdrop } from './SheetBackdrop'
import { DescriptionAutocomplete } from './DescriptionAutocomplete'
import {
  createTransaction,
  editTransaction,
  softDeleteTransaction,
  getDescriptionSuggestions,
} from '@/actions/transaction'
import { editAndConfirmPending } from '@/actions/recurringExpense'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import type { RecordStatus } from '@/lib/validators'
import { localTodayISO, ymdToUTCNoon } from '@/lib/local-date'
import { CategoryPicker } from './CategoryPicker'
import { DateField } from './DateField'
import { AssetLinkField } from './AssetLinkField'
import { PayerToggle } from './PayerToggle'
import { SplitTypeSelector } from './SplitTypeSelector'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'

export interface AddSheetInitial {
  id: string
  amount: number
  description: string
  category: string
  splitType: SplitType
  splitRatioA: number | null
  payerId: string
  transactedAt: string  // ISO
  assetId?: string | null
  notes?: string | null
  status?: RecordStatus
}

interface Props {
  open: boolean
  onClose: () => void
  initial?: AddSheetInitial
  /**
   * Called after a successful create/edit/delete. Caller refreshes its own data.
   * Optional `info.isFirstTransaction` is only set on a successful create when
   * the per-user paid_by count for the group flipped to 1, used by Dashboard
   * to surface the #43 phase C card. `savedAmount` / `edit` / `deleted` drive
   * the success toast on the dashboard side.
   */
  onMutated?: (info?: {
    isFirstTransaction?: boolean
    savedAmount?: number
    edit?: boolean
    deleted?: boolean
  }) => void
  /** When opening in create mode from a car-detail FAB, prefill the asset link. */
  prefilledAssetId?: string | null
  /** Optional category prefill for create mode (e.g. 'transit' from car-detail FAB). */
  prefilledCategory?: CategoryId
  /**
   * Recurring-expense pending mode. When set, `initial` carries the prefill
   * snapshot but the sheet routes submit to editAndConfirmPending instead of
   * editTransaction, and hides the delete + notes affordances (the underlying
   * pending is not a real CashTransaction; notes are not persisted by the
   * override contract).
   */
  pendingExpenseId?: string
  /** Called when an edit-pending submit loses to a partner race. */
  onRaceResolved?: (message: string) => void
  groupDefaultRatioA?: number | null
}

export function AddSheet({ open, onClose, initial, onMutated, prefilledAssetId, prefilledCategory, pendingExpenseId, onRaceResolved, groupDefaultRatioA }: Props) {
  const { viewer, partner, isSolo } = useMember()
  const t = useTranslations()
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [category, setCategory] = useState<CategoryId>('dining')
  const [split, setSplit] = useState<SplitType>('half')
  const [splitRatioA, setSplitRatioA] = useState<number>(50)
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<RecordStatus>('settled')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const amountInputRef = useRef<HTMLInputElement>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [descSuggestions, setDescSuggestions] = useState<string[]>([])

  // Fetch household-wide description history when the sheet opens. Re-fetched
  // on every open so newly-added descriptions surface immediately on the next
  // entry (and so we don't hold stale data across days). Cancelled if the
  // sheet closes mid-flight to avoid a setState-after-unmount.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getDescriptionSuggestions()
      .then((list) => { if (!cancelled) setDescSuggestions(list) })
      .catch(() => { /* autocomplete is best-effort; failing it shouldn't surface an error */ })
    return () => { cancelled = true }
  }, [open])

  // Reset / prefill on open. Re-runs if `initial` changes.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setDesc(initial.description)
      setCategory(
        (PICKABLE_CATEGORIES.find((c) => c.id === initial.category)?.id as CategoryId) ?? 'dining',
      )
      setSplit(initial.splitType === 'half' ? 'weighted' : initial.splitType)
      setSplitRatioA(initial.splitRatioA ?? groupDefaultRatioA ?? 50)
      setPayerWho(initial.payerId === viewer.id ? 'M' : 'T')
      // Use LOCAL date components, not the UTC ISO prefix — otherwise a row stored at
      // local midnight (e.g. 2026-05-02 00:00 in UTC+8 = 2026-05-01T16:00:00Z) would
      // show as 2026-05-01 in the picker and silently shift one day on save.
      const dt = new Date(initial.transactedAt)
      const localYMD =
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      setDate(localYMD)
      setAssetId(initial.assetId ?? null)
      setNotes(initial.notes ?? '')
      setStatus(initial.status ?? 'settled')
    } else {
      setAmount('')
      setDesc('')
      setCategory(prefilledCategory ?? 'dining')
      setSplit(isSolo ? 'all_mine' : 'weighted')
      setSplitRatioA(groupDefaultRatioA ?? 50)
      setPayerWho('M')
      setDate(localTodayISO())
      setAssetId(prefilledAssetId ?? null)
      setNotes('')
      setStatus('settled')
    }
    setError('')
  }, [open, initial, viewer.id, viewer.defaultSplitType, isSolo, prefilledAssetId, prefilledCategory, groupDefaultRatioA])

  // Wait for slide-up to finish, then focus + select-all so users can type-to-replace
  // the prefilled amount in edit mode (typing replaces the selection rather than
  // appending to "240" → "2405").
  useFocusAndSelectOnOpen(open, amountInputRef)

  const isPending = !!pendingExpenseId
  // Edit affordance (delete button + editTransaction path) only for real tx.
  // Pending occurrences are not yet real tx → no delete; submit goes to
  // editAndConfirmPending instead.
  const isEdit = !!initial && !isPending

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError(t.addSheet.errors.amountRequired); return }
    if (!desc.trim()) { setError(t.addSheet.errors.descriptionRequired); return }
    if (payerWho === 'T' && !partner) { setError(t.addSheet.errors.noPartner); return }
    const payerId = isSolo ? viewer.id : (payerWho === 'M' ? viewer.id : partner!.id)
    const splitType: SplitType = isSolo ? 'all_mine' : split
    const transactedAt = ymdToUTCNoon(date)

    startTransition(async () => {
      try {
        let isFirstTransaction = false
        if (isPending) {
          await editAndConfirmPending({
            pendingId: pendingExpenseId!,
            overrides: {
              amount: n,
              description: desc,
              category,
              splitType,
              splitRatioA: split === 'weighted' ? splitRatioA : null,
              paidBy: payerId,
              transactedAt: date,
              assetId,
            },
          })
        } else if (isEdit) {
          await editTransaction({
            oldId: initial!.id,
            amount: n,
            description: desc,
            category,
            splitType,
            splitRatioA: split === 'weighted' ? splitRatioA : null,
            payerId,
            transactedAt,
            assetId,
            notes,
            status,
          })
        } else {
          const result = await createTransaction({
            amount: n,
            description: desc,
            category,
            splitType,
            splitRatioA: split === 'weighted' ? splitRatioA : null,
            payerId,
            transactedAt,
            assetId,
            notes,
            status,
          })
          isFirstTransaction = result.isFirstTransaction
        }
        onMutated?.({ isFirstTransaction, savedAmount: n, edit: isEdit || isPending })
        onClose()
      } catch (e) {
        const msg = describeError(e, t.common.error, t.common.offlineError)
        // Race: partner confirmed/skipped this pending in another tab/device
        // before our edit-confirm landed. Action errors in that case contain
        // '待確認支出' (matches both '已被處理或找不到' and '已被其他裝置處理').
        if (isPending && msg.includes('待確認支出')) {
          onMutated?.()
          onClose()
          onRaceResolved?.(t.recurringExpense.raceMessage)
          return
        }
        setError(msg)
      }
    })
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const performDelete = () => {
    if (!isEdit) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteTransaction(initial!.id)
        onMutated?.({ deleted: true })
        onClose()
      } catch (e) {
        setError(describeError(e, t.common.error, t.common.offlineError))
      }
    })
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed left-1/2 bottom-0 z-[100] w-full max-w-md -translate-x-1/2 flex flex-col overflow-hidden"
        style={{
          background: 'var(--bg)',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
          maxHeight: '92dvh',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Grabber */}
        <div className="pt-2 flex justify-center">
          <div
            className="w-9 h-[5px] rounded-full"
            style={{ background: 'rgba(31,27,22,0.18)' }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <button
            onClick={onClose}
            className="bg-transparent border-0 text-body cursor-pointer p-1"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.common.cancel}
          </button>
          <div
            className="text-base font-semibold tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? t.addSheet.titleEdit : t.addSheet.title}
          </div>
          <button
            onClick={handleSave}
            disabled={!amount || pending}
            className="bg-transparent border-0 text-body font-semibold p-1 cursor-pointer disabled:cursor-default"
            style={{
              color:
                amount && !pending ? 'var(--accent)' : 'var(--ink-3)',
            }}
          >
            {pending ? t.common.saving : isEdit ? t.common.update : t.common.save}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {/* Amount + payer toggle */}
          <div
            className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div
              className="text-xs tracking-[0.6px] mb-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.addSheet.amount}
            </div>
            <label
              className="flex items-baseline justify-center gap-1.5 min-h-[60px] cursor-text"
              onClick={() => {
                // Focus + select on tap anywhere in the hero (NT$ label, the gap,
                // or the digits). Native click on the inner <input> would also focus
                // it, but tapping the label gives users a much wider hit target.
                const el = amountInputRef.current
                if (!el) return
                el.focus()
                el.select()
              }}
            >
              <span
                className="text-title font-medium"
                style={{ color: amount ? 'var(--ink-2)' : 'var(--ink-3)' }}
              >
                NT$
              </span>
              <input
                ref={amountInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                value={amount ? parseInt(amount, 10).toLocaleString('en-US') : ''}
                onChange={(e) => {
                  // strip non-digits, drop leading zeros, cap at 7 digits
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setAmount(next)
                }}
                placeholder="0"
                aria-label={t.addSheet.amount}
                className="tnum tracking-[-2px] leading-none bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 'var(--fs-amount-lg)',
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  // Min 2ch so empty/single-digit values still have a comfortable hit area;
                  // grows with formatted (comma-separated) length up to 9ch (7 digits + 2 commas).
                  width: `${Math.max((amount ? parseInt(amount, 10).toLocaleString('en-US').length : 1), 2)}ch`,
                  caretColor: 'var(--accent)',
                }}
              />
            </label>

            {!isSolo && (
              <PayerToggle value={payerWho} onChange={setPayerWho} />
            )}
          </div>

          {/* Description (with autocomplete from household history) */}
          <DescriptionAutocomplete
            value={desc}
            onChange={setDesc}
            suggestions={descSuggestions}
            placeholder={t.addSheet.descPlaceholder}
            listboxLabel={t.addSheet.descSuggestions}
          />

          {/* Categories */}
          <div className="pt-5 pb-[18px]">
            <div className="text-xs tracking-[0.6px] px-6 pb-3" style={{ color: 'var(--ink-3)' }}>
              {t.addSheet.category}
            </div>
            <CategoryPicker value={category} onChange={setCategory} />
          </div>

          {/* Asset link (visible in both solo and dual mode) */}
          <div className="px-5 pt-2 pb-[18px] mt-1" style={{ borderTop: '1px solid var(--hairline)' }}>
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              {t.addSheet.assetLink}
            </div>
            <AssetLinkField value={assetId} onChange={setAssetId} open={open} />
          </div>

          {!isSolo && (
            <div className="px-5 pt-2 pb-[18px] mt-1"
              style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
                {t.addSheet.splitMethod}
              </div>
              <SplitTypeSelector
                value={split}
                splitRatioA={splitRatioA}
                onSplitRatioAChange={setSplitRatioA}
                onChange={setSplit}
                amount={parseInt(amount, 10) || 0}
                payerWho={payerWho}
              />
            </div>
          )}

          {/* Date */}
          <div className="px-5 pt-1 pb-2">
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              {t.addSheet.date}
            </div>
            <DateField value={date} onChange={setDate} open={open} />
          </div>

          {/* Status (settled / pending). Hidden in pending-confirm mode: the
              recurring-expense confirm flow always lands a settled record. */}
          {!isPending && (
            <div className="px-5 pt-1 pb-2">
              <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
                {t.addSheet.statusLabel}
              </div>
              <div
                className="inline-flex rounded-full p-[3px] gap-0.5"
                style={{ background: 'var(--toggle-segment-track)' }}
              >
                {(['settled', 'pending'] as const).map((s) => {
                  const sel = status === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className="oik-segment h-8 px-4 rounded-full border-0 text-label font-medium cursor-pointer"
                      style={{
                        background: sel ? 'var(--toggle-segment-thumb)' : 'transparent',
                        color: sel ? 'var(--ink)' : 'var(--ink-2)',
                        boxShadow: sel ? 'var(--toggle-segment-thumb-shadow)' : 'none',
                        transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
                      }}
                    >
                      {s === 'settled' ? t.addSheet.statusSettled : t.addSheet.statusPending}
                    </button>
                  )
                })}
              </div>
              {status === 'pending' && (
                <div className="text-micro px-1 mt-2" style={{ color: 'var(--ink-3)' }}>
                  {t.addSheet.statusPendingHint}
                </div>
              )}
            </div>
          )}

          {/* Shared notes / memo (optional, both partners can read + write).
              Hidden in pending mode: editAndConfirmPending overrides do not
              accept a notes field, so anything typed here would be silently
              dropped — better to omit the affordance. */}
          {!isPending && (
            <div className="px-5 pt-3 pb-6" style={{ borderTop: '1px solid var(--hairline)' }}>
              <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
                {t.addSheet.notesLabel}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.addSheet.notesPlaceholder}
                maxLength={2000}
                rows={3}
                className="w-full bg-transparent border-0 outline-none text-sm leading-relaxed px-1 py-2 resize-none"
                style={{ color: 'var(--ink)' }}
              />
            </div>
          )}

          {isEdit && (
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
                {t.addSheet.deleteOne}
              </button>
            </div>
          )}

          {/* Bottom spacer: extends past the iOS home indicator (env safe-area-inset-bottom)
              so the last input/button isn't visually clipped on devices with a gesture bar. */}
          <div style={{ height: 'calc(24px + env(safe-area-inset-bottom))' }} />
        </div>
      </div>

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
        title={t.addSheet.deleteConfirmTitle}
        description={t.common.deleteSoftDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}
