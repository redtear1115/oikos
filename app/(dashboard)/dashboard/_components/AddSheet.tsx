'use client'

import { useState, useEffect, useRef } from 'react'
import { useFocusAndSelectOnOpen } from '@/app/(dashboard)/_components/useFocusAndSelectOnOpen'
import { useScrollToTopOnOpen } from '@/app/(dashboard)/_components/useScrollToTopOnOpen'
import { useSheetMutation } from '@/app/(dashboard)/_components/useSheetMutation'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { SheetBody } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { AmountInput } from '@/app/(dashboard)/_components/AmountInput'
import { DescriptionAutocomplete } from './DescriptionAutocomplete'
import {
  createTransaction,
  editTransaction,
  softDeleteTransaction,
  getDescriptionSuggestions,
} from '@/actions/transaction'
import {
  createTripExpense,
  editTripExpense,
  softDeleteTripExpense,
} from '@/actions/tripExpense'
import { editAndConfirmPending } from '@/actions/recurringExpense'
import { PICKABLE_CATEGORIES } from '@/lib/categories'
import type { CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { MAX_AMOUNT, type RecordStatus } from '@/lib/validators'
import { localTodayISO, ymdToUTCNoon } from '@/lib/local-date'
import { CategoryPicker } from './CategoryPicker'
import { DateField } from '@/app/(dashboard)/_components/DateField'
import { AssetLinkField } from './AssetLinkField'
import { PayerToggle } from './PayerToggle'
import { SplitTypeSelector } from './SplitTypeSelector'
import { useTranslations } from '@/lib/i18n/client'
import { currencySymbol, formatAmount, type CurrencyCode } from '@/lib/currency'
import { convertViaSnapshot } from '@/lib/trip-currency'
import { CurrencySelector } from './CurrencySelector'
import { TripSelector, type TripOption } from './TripSelector'
import { loadedSplitRatioToViewerShare, toMemberAShare } from '@/lib/splitRatio'

export interface AddSheetInitial {
  id: string
  /**
   * Which table this record lives in. `'transaction'` = CashTransactions
   * (main ledger). `'trip-expense'` = TripExpenses (isolated trip sandbox,
   * v0.17.2 #42). Defaults to `'transaction'` when omitted for legacy
   * callsites. Trip-expense rows carry a `tripId` so edit/delete can route.
   */
  kind?: 'transaction' | 'trip-expense'
  tripId?: string  // required when kind = 'trip-expense'
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

/** Shape of a single rate entry coming from listRatesForGroup. */
export interface RateEntry {
  fromCurrency: string
  toCurrency: string
  rate: string
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
  /** Optional category prefill for create mode (e.g. 'transit' from car-detail FAB).
   */
  prefilledCategory?: CategoryId
  /**
   * Force the new record into a specific trip. Wins over the date-range
   * auto-detect so the trip-detail FAB always lands inside its own trip,
   * even when the trip starts in the future. The TripSelector is hidden
   * while this is set in create mode — the trip context is implicit
   * from the host page. Ignored in edit mode (edits carry their own
   * `initial.tripId`).
   */
  prefilledTripId?: string | null
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
  /** The group's base currency (default: 'twd'). */
  baseCurrency?: CurrencyCode
  /** Active trips in the current epoch, for the TripSelector. */
  activeTrips?: TripOption[]
  /** Exchange rates for this group, used for conversion preview. */
  rates?: RateEntry[]
}

export function AddSheet({ open, onClose, initial, onMutated, prefilledAssetId, prefilledCategory, prefilledTripId, pendingExpenseId, onRaceResolved, groupDefaultRatioA, baseCurrency = 'twd', activeTrips = [], rates = [] }: Props) {
  const { viewer, partner, isSolo, viewerIsA } = useMember()
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
  const {
    pending, error, setError,
    confirmingDelete, setConfirmingDelete,
    runMutation, performDelete: dispatchDelete,
  } = useSheetMutation()
  const amountInputRef = useRef<HTMLInputElement>(null)
  const scrollableRef = useRef<HTMLDivElement>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [descSuggestions, setDescSuggestions] = useState<string[]>([])

  // Trip + currency state (#68 #42). Multi-currency is a trip-sub-ledger
  // affordance: the main ledger (CashTransactions) is single-currency,
  // always in baseCurrency. The CurrencySelector is therefore only shown
  // when the record is going to TripExpenses (tripId set). For main-ledger
  // creates / edits, handleSave forces `currency: baseCurrency` regardless
  // of internal state, so this stays correct even if the state lags.
  const [tripId, setTripId] = useState<string | null>(null)
  // Free-text since v0.17.4 #410 — trip currencies can be user-defined (VND etc.)
  const [currency, setCurrency] = useState<string>(baseCurrency)

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

  // Stable trip-id hash for the reset effect's deps. The parent re-creates
  // `activeTrips` on every render (new array reference), which would otherwise
  // re-fire the reset effect mid-edit and wipe the user's typed amount (#386).
  // Hashing by id collapses identity churn to value equality — the effect only
  // re-runs when the *set* of active trips actually changes (trip created /
  // ended / archived). startDate / endDate / defaultCurrency changes on an
  // existing trip don't trigger a reset, which is the desired behavior: a
  // mid-edit reset is more disruptive than a marginally stale prefill.
  const activeTripsKey = activeTrips.map((trip) => trip.id).join('|')

  // Reset / prefill on open. Re-runs if `initial` changes.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(String(initial.amount))
      setDesc(initial.description)
      setCategory(
        PICKABLE_CATEGORIES.find((c) => c.id === initial.category)?.id ?? 'dining',
      )
      setSplit(initial.splitType === 'half' ? 'weighted' : initial.splitType)
      // DB stores split_ratio_a as member A's share; form state tracks the
      // **viewer's** share (slider + labels say "我 X% / 對方 Y%"). For
      // viewer = member B the two angles flip — without this conversion an
      // existing weighted record opens with the partner's % labelled as the
      // viewer's, which then drives a wrong preview + wrong post-save row.
      // The groupDefaultRatioA fallback is passed through raw — it's only
      // used when the record itself carries no override, and is governed by
      // SplitRatioSection's own viewer-aware save path.
      setSplitRatioA(
        loadedSplitRatioToViewerShare(initial.splitRatioA, viewerIsA, groupDefaultRatioA ?? 50),
      )
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
      // In edit mode: reset to base currency (the stored amount is always in base)
      setCurrency(baseCurrency)
      // Trip-expense edits stay bound to their trip; transaction edits clear
      // the trip selector (legacy CashTransactions can drop their trip_id tag
      // on edit — new trip-tagged records go to TripExpenses instead).
      setTripId(initial.kind === 'trip-expense' ? (initial.tripId ?? null) : null)
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
      // prefilledTripId (FAB on /trips/[id]) wins over the date-range
      // auto-detect, so trips that start in the future still tag correctly.
      const lockedTrip = prefilledTripId
        ? activeTrips.find((trip) => trip.id === prefilledTripId) ?? null
        : null
      const todayStr = localTodayISO()
      const foundTrip = lockedTrip ?? activeTrips.find(
        (trip) => todayStr >= trip.startDate && (!trip.endDate || todayStr <= trip.endDate),
      ) ?? null
      setTripId(foundTrip?.id ?? null)
      setCurrency(foundTrip?.defaultCurrency ?? baseCurrency)
    }
    setError('')
  // `activeTrips` is intentionally excluded — its identity changes every parent
  // render but its meaningful state is captured by `activeTripsKey`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, viewer.id, viewer.defaultSplitType, isSolo, prefilledAssetId, prefilledCategory, prefilledTripId, groupDefaultRatioA, baseCurrency, activeTripsKey])

  // Reset scroll position before paint so the sheet always opens at the top —
  // the container stays mounted across closes and would otherwise preserve
  // scrollTop from the previous session.
  useScrollToTopOnOpen(scrollableRef, open)

  // Wait for slide-up to finish, then focus + select-all so users can type-to-replace
  // the prefilled amount in edit mode (typing replaces the selection rather than
  // appending to "240" → "2405").
  useFocusAndSelectOnOpen(open, amountInputRef)

  const isPending = !!pendingExpenseId
  // Edit affordance (delete button + editTransaction path) only for real tx.
  // Pending occurrences are not yet real tx → no delete; submit goes to
  // editAndConfirmPending instead.
  const isEdit = !!initial && !isPending
  const editingTripExpense = isEdit && initial?.kind === 'trip-expense'

  // splitRatio on TripExpenses is the payer's share %. AddSheet's
  // splitRatioA state is the **viewer's** share %, so: if the viewer is
  // the payer it's already the payer's share; otherwise the partner is
  // the payer and their share is the complement.
  function deriveTripSplitRatio(): number | null {
    if (split !== 'weighted') return null
    return payerWho === 'M' ? splitRatioA : 100 - splitRatioA
  }

  // CashTransactions.split_ratio_a is member A's share. The form state is
  // the viewer's share; flip at the wire boundary so DB / balance calc see
  // the schema-correct value regardless of which member the viewer is.
  function deriveCashSplitRatioA(): number | null {
    if (split !== 'weighted') return null
    return toMemberAShare(splitRatioA, viewerIsA)
  }

  const handleSave = () => {
    const n = parseInt(amount, 10)
    if (!n || n <= 0) { setError(t.addSheet.errors.amountRequired); return }
    if (n > MAX_AMOUNT) {
      setError(t.addSheet.errors.amountTooLarge.replace('{max}', MAX_AMOUNT.toLocaleString('en-US')))
      return
    }
    if (!desc.trim()) { setError(t.addSheet.errors.descriptionRequired); return }
    if (payerWho === 'T' && !partner) { setError(t.addSheet.errors.noPartner); return }
    const payerId = isSolo ? viewer.id : (payerWho === 'M' ? viewer.id : partner!.id)
    const splitType: SplitType = isSolo ? 'all_mine' : split

    // Capture isFirstTransaction across the closure since runMutation's
    // op/onSuccess split breaks the linear flow.
    let isFirstTransaction = false

    runMutation(
      async () => {
        if (isPending) {
          await editAndConfirmPending({
            pendingId: pendingExpenseId!,
            overrides: {
              amount: n,
              description: desc,
              category,
              splitType,
              splitRatioA: deriveCashSplitRatioA(),
              paidBy: payerId,
              transactedAt: date,
              assetId,
            },
          })
        } else if (initial && editingTripExpense) {
          // Edit stays inside TripExpenses (no migration between tables).
          // TripExpense action still accepts Date/string and does its own
          // conversion (out of scope for #453).
          await editTripExpense({
            id: initial.id,
            tripId: initial.tripId!,
            paidBy: payerId,
            amount: n,
            currency,
            category,
            splitType,
            splitRatio: deriveTripSplitRatio(),
            description: desc,
            transactedAt: ymdToUTCNoon(date),
          })
        } else if (initial && isEdit) {
          // CashTransaction edits drop `tripId` — new trip-tagging is only
          // available on create (and routes to TripExpenses, not here).
          // Main ledger is single-currency by design; force baseCurrency so
          // the row never carries an originalCurrency snapshot.
          await editTransaction({
            oldId: initial.id,
            amount: n,
            description: desc,
            category,
            splitType,
            splitRatioA: deriveCashSplitRatioA(),
            payerId,
            transactedAt: date,
            assetId,
            notes,
            status,
            currency: baseCurrency,
            tripId: null,
          })
        } else if (tripId) {
          // Trip-tagged creates go to the isolated TripExpenses table.
          // Asset link / notes / pending status are not supported on trip
          // expenses by design (see lib/db/schema.ts TripExpenses block).
          await createTripExpense({
            tripId,
            paidBy: payerId,
            amount: n,
            currency,
            category,
            splitType,
            splitRatio: deriveTripSplitRatio(),
            description: desc,
            transactedAt: ymdToUTCNoon(date),
          })
        } else {
          // Main ledger create. Single-currency by design — force
          // baseCurrency on the wire even if `currency` state got cascaded
          // by an earlier trip selection that's since been cleared.
          const result = await createTransaction({
            amount: n,
            description: desc,
            category,
            splitType,
            splitRatioA: deriveCashSplitRatioA(),
            payerId,
            transactedAt: date,
            assetId,
            notes,
            status,
            currency: baseCurrency,
            tripId: null,
          })
          isFirstTransaction = result.isFirstTransaction
        }
      },
      {
        fallbackMsg: t.common.error,
        offlineMsg: t.common.offlineError,
        onSuccess: () => {
          onMutated?.({ isFirstTransaction, savedAmount: n, edit: isEdit || isPending })
          onClose()
        },
        onError: (msg) => {
          // Race: partner confirmed/skipped this pending in another tab/device
          // before our edit-confirm landed. Action errors in that case contain
          // '待確認支出' (matches both '已被處理或找不到' and '已被其他裝置處理').
          if (isPending && msg.includes('待確認支出')) {
            onMutated?.()
            onClose()
            onRaceResolved?.(t.recurringExpense.raceMessage)
            return true
          }
        },
      },
    )
  }

  const performDelete = () => {
    if (!isEdit || !initial) return
    dispatchDelete(
      async () => {
        if (editingTripExpense) {
          await softDeleteTripExpense({ id: initial.id, tripId: initial.tripId! })
        } else {
          await softDeleteTransaction(initial.id)
        }
      },
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
      <SheetFrame open={open} onClose={onClose} ariaLabel={isEdit ? t.addSheet.titleEdit : t.addSheet.title}>
        {/* Header — 3-column layout (cancel | centred title | save); non-standard for SheetHeader primitive */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <div
            className="text-base font-medium tracking-wide"
            style={{ color: 'var(--ink)' }}
          >
            {isEdit ? t.addSheet.titleEdit : t.addSheet.title}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={!amount || pending}
            className="font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {pending ? t.common.saving : isEdit ? t.common.update : t.common.save}
          </Button>
        </div>

        <SheetBody noPadding ref={scrollableRef}>
          {/* Amount + payer toggle */}
          <div className="px-6 pt-6 pb-7 text-center border-b border-hairline">
            <div
              className="text-xs tracking-[0.6px] mb-3"
              style={{ color: 'var(--ink-3)' }}
            >
              {t.addSheet.amount}
            </div>
            <AmountInput
              value={amount}
              onChange={setAmount}
              symbol={currencySymbol(currency)}
              ariaLabel={t.addSheet.amount}
              inputRef={amountInputRef}
            />

            {/* Trip + currency selectors — currency is only user-pickable
                in the trip-sub-ledger path (tripId set). Main-ledger records
                are single-currency by design and always saved in
                baseCurrency, so we hide the picker there. The trip selector
                is hidden when prefilledTripId locks us to the host page's
                trip (the FAB on /trips/[id]). */}
            <div className="flex items-center justify-center gap-2 mt-3">
              {!(prefilledTripId && !isEdit) && (
                <TripSelector
                  value={tripId}
                  options={activeTrips}
                  onChange={(next) => {
                    setTripId(next)
                    // Trip set → cascade currency from its defaultCurrency.
                    // Trip cleared → snap back to baseCurrency (the main
                    // ledger is single-currency; we won't render a picker
                    // anyway, but keep state coherent).
                    const trip = next ? activeTrips.find((tp) => tp.id === next) : null
                    setCurrency(trip?.defaultCurrency ?? baseCurrency)
                  }}
                  noTripLabel={t.addSheet.noTrip}
                />
              )}
              {tripId && (() => {
                const trip = activeTrips.find((tp) => tp.id === tripId)
                // Trip-scoped currency picker: only the codes this trip selected
                // at creation (see TripSheet). Falls back to defaultCurrency-only
                // for legacy trips whose snapshot lacks entries (shouldn't happen
                // post-#410 migration; defensive).
                const codes = trip?.currencies?.entries.map((e) => e.code)
                  ?? (trip?.defaultCurrency ? [trip.defaultCurrency] : undefined)
                return (
                  <CurrencySelector
                    value={currency}
                    onChange={setCurrency}
                    codes={codes}
                  />
                )
              })()}
            </div>

            {/* Conversion preview: shown when foreign currency with known rate.
                v0.17.4 #410 — uses the trip's frozen rate_snapshot rather than
                the deprecated group-wide CurrencyRates. */}
            {(() => {
              const amountInt = parseInt(amount, 10) || 0
              if (!tripId || currency === baseCurrency || amountInt <= 0) return null
              const trip = activeTrips.find((tp) => tp.id === tripId)
              const snapshot = trip?.currencies
              if (!snapshot) return null
              const converted = convertViaSnapshot(amountInt, currency, baseCurrency, snapshot)
              if (converted == null) return null
              return (
                <div className="text-xs mt-2" style={{ color: 'var(--ink-3)' }}>
                  ≈ {formatAmount(converted, baseCurrency)}
                </div>
              )
            })()}

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
          <div className="px-5 pt-2 pb-[18px] mt-1 border-t border-hairline">
            <div className="text-xs tracking-[0.6px] px-1 py-3" style={{ color: 'var(--ink-3)' }}>
              {t.addSheet.assetLink}
            </div>
            <AssetLinkField value={assetId} onChange={setAssetId} open={open} />
          </div>

          {!isSolo && (
            <div className="px-5 pt-2 pb-[18px] mt-1 border-t border-hairline">
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

          {/* Status (settled / pending). Hidden in:
              - pending-confirm mode (recurring-expense confirm lands settled)
              - trip mode (#410: TripExpenses have no `status` column; all rows
                are settled by design — surfacing the toggle would lie). */}
          {!isPending && !tripId && (
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
            <div className="px-5 pt-3 pb-6 border-t border-hairline">
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
                className="w-full h-12 rounded-bubble border-0 cursor-pointer text-sm font-medium disabled:opacity-50"
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
        </SheetBody>
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
