'use client'

import { useState, useEffect, useRef } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useScrollToTopOnOpen } from '@/app/(dashboard)/_components/useScrollToTopOnOpen'
import { useSheetMutation } from '@/app/(dashboard)/_components/useSheetMutation'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { ScrollFadeRow } from '@/app/(dashboard)/_components/ScrollFadeRow'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { AmountInput } from '@/app/(dashboard)/_components/AmountInput'
import { DateField } from '@/app/(dashboard)/_components/DateField'
import { Button } from '@/components/ui/Button'
import { IncomeChip } from './IncomeChip'
import { createIncome, editIncome, softDeleteIncome, getInsuranceAssets } from '@/actions/income'
import { editAndConfirmPending } from '@/actions/recurringIncome'
import { PICKABLE_INCOME_CATEGORIES } from '@/lib/incomeCategories'
import type { IncomeCategoryId } from '@/lib/incomeCategories'
import { MAX_AMOUNT } from '@/lib/validators'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { localTodayISO } from '@/lib/local-date'
import { useTranslations } from '@/lib/i18n/client'

// ─── Inline sub-components ──────────────────────────────────────────────────

function PolicyIcon({ color = '#3F6A56' }: { color?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M11 2l7 3v5.5c0 4-3 7.5-7 9.5-4-2-7-5.5-7-9.5V5l7-3z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 11l2 2 4-4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="12" height="7" viewBox="0 0 12 7" fill="none" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Main IncomeSheet ────────────────────────────────────────────────────────

export interface IncomeSheetInitial {
  id: string
  amount: number
  category: string
  recipientId: string
  occurredAt: string   // ISO date YYYY-MM-DD
  source: string | null
  assetId: string | null
}

// mode controls submit routing + UI affordances:
// - 'edit-income' (default when initial is set): editIncome + delete button
// - 'edit-pending': prefill from a PendingIncomeOccurrence; submit routes to
//   editAndConfirmPending(pendingId, fields). No delete button (the underlying
//   pending is not a real IncomeTx; resolving creates one atomically).
export type IncomeSheetMode = 'edit-income' | 'edit-pending'

interface Props {
  open: boolean
  onClose: () => void
  initial?: IncomeSheetInitial
  onMutated?: (info?: { savedAmount?: number; edit?: boolean; deleted?: boolean }) => void
  // Called when an edit-pending submit loses to a partner race
  // (pending already confirmed/skipped). Sheet has already closed; parent
  // should surface a toast like "對方剛剛確認了這筆".
  onRaceResolved?: (message: string) => void
  prefilledAssetId?: string | null
  prefilledCategory?: IncomeCategoryId
  prefilledAmount?: number
  mode?: IncomeSheetMode
  pendingId?: string
}

export function IncomeSheet({ open, onClose, initial, onMutated, onRaceResolved, prefilledAssetId, prefilledCategory, prefilledAmount, mode, pendingId }: Props) {
  const { viewer, partner, isSolo, viewerIsA } = useMember()
  const t = useTranslations()
  const P = DEFAULT_INCOME_PALETTE

  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<IncomeCategoryId>('salary')
  const [recipientWho, setRecipientWho] = useState<'M' | 'T'>('M')
  const [date, setDate] = useState(localTodayISO())
  const [note, setNote] = useState('')
  const [assetId, setAssetId] = useState<string | null>(null)
  const {
    pending, error, setError,
    confirmingDelete, setConfirmingDelete,
    runMutation, performDelete: dispatchDelete,
  } = useSheetMutation()

  // Policy picker state
  const [showPolicyPicker, setShowPolicyPicker] = useState(false)
  const [insuranceAssets, setInsuranceAssets] = useState<{ id: string; name: string }[]>([])

  const amountInputRef = useRef<HTMLInputElement>(null)
  const scrollableRef = useRef<HTMLDivElement>(null)

  // Derived: resolve the selected policy name from assetId + loaded assets
  const selectedPolicyName = assetId
    ? (insuranceAssets.find(a => a.id === assetId)?.name ?? null)
    : null

  const isPending = mode === 'edit-pending'
  // Edit affordance (delete button + editIncome path) only for real IncomeTx.
  // Pending occurrences are not yet real tx → no delete; submit goes to
  // editAndConfirmPending instead.
  const isEdit = !!initial && !isPending
  const policyRelevant = category === 'maturity' || category === 'claim'

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setCategory(
        PICKABLE_INCOME_CATEGORIES.find(c => c.id === initial.category)?.id ?? 'salary'
      )
      setRecipientWho(initial.recipientId === viewer.id ? 'M' : 'T')
      const dt = new Date(initial.occurredAt + 'T00:00:00')
      setDate(
        `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      )
      setNote(initial.source ?? '')
      setAssetId(initial.assetId ?? null)
    } else {
      setAmount(prefilledAmount !== undefined ? String(prefilledAmount) : '')
      setCategory(prefilledCategory ?? 'salary')
      setRecipientWho('M')
      setDate(localTodayISO())
      setNote('')
      setAssetId(prefilledAssetId ?? null)
    }
    setError('')
    setConfirmingDelete(false)
    setShowPolicyPicker(false)
  }, [open, initial, viewer.id, prefilledAssetId, prefilledCategory, prefilledAmount, setError, setConfirmingDelete])

  // Auto-suggest policy picker when category is maturity/claim
  useEffect(() => {
    const relevant = category === 'maturity' || category === 'claim'
    if (relevant) {
      setShowPolicyPicker(true)
      // Load insurance assets lazily
      getInsuranceAssets().then(setInsuranceAssets).catch(() => {})
    } else {
      setShowPolicyPicker(false)
      setAssetId(null)
    }
  }, [category])

  // Reset scroll position before paint so the sheet always opens at the top —
  // the container stays mounted across closes and would otherwise preserve
  // scrollTop from the previous session.
  useScrollToTopOnOpen(scrollableRef, open)

  // Focus + select amount input after sheet slides up
  useFocusAndSelectOnOpen(open, amountInputRef)

  const recipientId = isSolo
    ? viewer.id
    : recipientWho === 'M' ? viewer.id : partner!.id

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError(t.incomeSheet.errors.amountRequired); return }
    if (n > MAX_AMOUNT) {
      setError(t.incomeSheet.errors.amountTooLarge.replace('{max}', MAX_AMOUNT.toLocaleString('en-US')))
      return
    }

    runMutation(
      async () => {
        if (isPending) {
          if (!pendingId) throw new Error(t.incomeSheet.errors.missingPendingId)
          await editAndConfirmPending({
            pendingId,
            amount: n,
            category,
            recipientId,
            occurredAt: date,
            source: note.trim() || null,
            assetId,
          })
        } else if (initial && isEdit) {
          await editIncome({
            oldId: initial.id,
            amount: n,
            category,
            recipientId,
            occurredAt: date,
            source: note.trim() || null,
            assetId,
          })
        } else {
          await createIncome({
            amount: n,
            category,
            recipientId,
            occurredAt: date,
            source: note.trim() || null,
            assetId,
          })
        }
      },
      {
        fallbackMsg: t.incomeSheet.errors.saveFailed,
        offlineMsg: t.common.offlineError,
        onSuccess: () => {
          onMutated?.({ savedAmount: n, edit: isEdit || isPending })
          onClose()
        },
        onError: (msg) => {
          // Race: partner confirmed/skipped this pending in another tab/device
          // before our edit-confirm landed. The error messages from
          // editAndConfirmPending in that case are: '待確認收入已被處理或找不到'
          // (pre-check) or '待確認收入已被其他裝置處理' (in-tx guard).
          if (isPending && msg.includes('待確認收入')) {
            onMutated?.()
            onClose()
            onRaceResolved?.(t.recurringIncome.raceMessage)
            return true
          }
        },
      },
    )
  }

  const performDelete = () => {
    if (!isEdit || !initial) return
    dispatchDelete(
      async () => { await softDeleteIncome(initial.id) },
      {
        fallbackMsg: t.common.error,
        offlineMsg: t.common.offlineError,
        onSuccess: () => {
          onMutated?.({ deleted: true })
          onClose()
        },
      },
    )
  }

  return (
    <>
      <SheetFrame
        open={open}
        onClose={onClose}
        ariaLabel={isEdit ? t.incomeSheet.titleEdit : t.incomeSheet.title}
        background={P.sheetBg}
        boxShadow="0 -10px 40px rgba(58,36,25,0.18)"
      >
        {/* Header — custom 3-column layout (cancel | centred title | save);
            SheetHeader primitive only supports a single trailing slot. */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1"
          >
            {t.common.cancel}
          </Button>
          <div
            className="text-base font-medium tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? t.incomeSheet.titleEdit : t.incomeSheet.title}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!amount || pending}
            className="p-1 font-medium"
            style={{ color: P.ink }}
          >
            {pending ? t.common.saving : isEdit ? t.common.update : t.common.save}
          </Button>
        </div>

        <div ref={scrollableRef} className="overflow-auto flex-1">
          {/* Amount + recipient toggle */}
          <div
            className="px-6 pt-6 pb-7 text-center"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <div
              className="text-xs tracking-[0.6px] mb-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.incomeSheet.amountLabel}
            </div>
            <AmountInput
              value={amount}
              onChange={setAmount}
              symbol="NT$"
              ariaLabel={t.incomeSheet.amountLabel}
              caretColor={P.ink}
              inputRef={amountInputRef}
            />

            {/* Recipient picker — mirrors PayerToggle layout/spacing, with
                income-palette accent on the selected pill. */}
            {!isSolo && (
              <div
                className="mt-[22px] flex items-center justify-center gap-2.5 text-label"
                style={{ color: 'var(--ink-2)' }}
              >
                <span>{t.incomeSheet.recipientPrompt}</span>
                <div
                  className="inline-flex rounded-full p-[3px] gap-0.5"
                  style={{ background: 'var(--toggle-segment-track)' }}
                >
                  {(['M', 'T'] as const).map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setRecipientWho(w)}
                      className="oik-segment h-7 px-3.5 rounded-full border-0 text-label font-medium cursor-pointer flex items-center gap-1.5"
                      style={{
                        background: recipientWho === w ? 'var(--toggle-segment-thumb)' : 'transparent',
                        color: recipientWho === w ? 'var(--ink)' : 'var(--ink-2)',
                        boxShadow: recipientWho === w
                          ? `var(--toggle-segment-thumb-shadow), 0 0 0 1px ${P.tint}`
                          : 'none',
                        transition: `background var(--toggle-transition), color var(--toggle-transition), box-shadow var(--toggle-transition)`,
                      }}
                    >
                      <Avatar
                        memberRole={whoToMemberRole(w, viewerIsA)}
                        initial={w === 'M' ? viewer.initial : partner?.initial ?? '?'}
                        src={w === 'M' ? viewer.avatarUrl : partner?.avatarUrl ?? null}
                        size={18}
                      />
                      {w === 'M' ? t.common.me : t.common.partner}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="pt-5 pb-[18px]">
            <div
              className="text-xs tracking-[0.6px] px-6 pb-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.incomeSheet.categoryLabel}
            </div>
            <ScrollFadeRow className="flex gap-2" style={{ padding: '0 20px' }} fadeTo={P.sheetBg}>
              {PICKABLE_INCOME_CATEGORIES.map(c => (
                <IncomeChip
                  key={c.id}
                  cat={c}
                  selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                />
              ))}
            </ScrollFadeRow>
          </div>

          {/* Policy link section — only for maturity/claim */}
          {policyRelevant && (
            <div
              className="px-5 pt-2 pb-[18px] mt-1"
              style={{ borderTop: '1px solid var(--hairline)' }}
            >
              <div
                className="text-xs tracking-[0.6px] px-1 py-3"
                style={{ color: 'var(--ink-3)' }}
              >
                {t.incomeSheet.policyLink}
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPolicyPicker(v => !v)
                  if (insuranceAssets.length === 0) {
                    getInsuranceAssets().then(setInsuranceAssets).catch(() => {})
                  }
                }}
                className="w-full flex items-center gap-3 text-left cursor-pointer"
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: `1px dashed ${P.ink}40`,
                  background: assetId ? P.tint : 'rgba(255,255,255,0.5)',
                }}
              >
                <PolicyIcon color={P.ink} />
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {selectedPolicyName ?? t.incomeSheet.selectPolicy}
                  </div>
                  <div className="text-micro mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    {category === 'maturity'
                      ? t.incomeSheet.maturityHint
                      : t.incomeSheet.claimHint}
                  </div>
                </div>
                <ChevronDown />
              </button>

              {showPolicyPicker && (
                <div
                  className="mt-2 overflow-hidden"
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 14,
                    border: '1px solid var(--hairline)',
                  }}
                >
                  {insuranceAssets.length === 0 ? (
                    <div className="px-4 py-3 text-sm" style={{ color: 'var(--ink-3)' }}>
                      {t.incomeSheet.noPolicy}
                    </div>
                  ) : (
                    insuranceAssets.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setAssetId(a.id)
                          setShowPolicyPicker(false)
                        }}
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                        style={{
                          padding: '14px 16px',
                          background: 'transparent',
                          border: 'none',
                          borderBottom:
                            i < insuranceAssets.length - 1 ? '1px solid var(--hairline)' : 'none',
                        }}
                      >
                        <div>
                          <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                            {a.name}
                          </div>
                          <div className="text-micro mt-0.5" style={{ color: 'var(--ink-3)' }}>
                            {t.incomeSheet.insuranceBadge}
                          </div>
                        </div>
                        <svg
                          width="7"
                          height="12"
                          viewBox="0 0 7 12"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1 1l5 5-5 5"
                            stroke="var(--ink-3)"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Date */}
          <div className="px-5 pt-1 pb-2">
            <div
              className="text-xs tracking-[0.6px] px-1 py-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.addSheet.date}
            </div>
            <DateField value={date} onChange={setDate} open={open} />
          </div>

          {/* Note */}
          <div
            className="px-5 pt-3 pb-6"
            style={{ borderTop: '1px solid var(--hairline)' }}
          >
            <div
              className="text-xs tracking-[0.6px] px-1 py-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.incomeSheet.noteLabel}
            </div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t.incomeSheet.notePlaceholder}
              maxLength={2000}
              rows={3}
              className="w-full bg-transparent border-0 outline-none text-sm leading-relaxed px-1 py-2 resize-none"
              style={{ color: 'var(--ink)' }}
            />
          </div>

          {/* Delete affordance — edit mode only */}
          {isEdit && (
            <div className="px-5 pb-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={pending}
                className="w-full h-12 rounded-bubble border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: 'var(--destructive)',
                  border: '1px solid var(--destructive-soft)',
                }}
              >
                {t.incomeSheet.deleteIncome}
              </button>
            </div>
          )}

          {/* Extend past the iOS home indicator (env safe-area-inset-bottom). */}
          <div style={{ height: 'calc(24px + env(safe-area-inset-bottom))' }} />
        </div>
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
        title={t.incomeSheet.deleteConfirmTitle}
        description={t.common.deleteSoftDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={performDelete}
      />
    </>
  )
}
