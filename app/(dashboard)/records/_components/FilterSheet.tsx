'use client'

import { useState, useEffect } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import { PICKABLE_INCOME_CATEGORIES, type IncomeCategoryId } from '@/lib/incomeCategories'
import {
  ASSET_FILTER_NONE,
  type DateRange,
  type PayerFilter,
  type SplitFilter,
  type StatusFilter,
  type TxnFilter,
} from '@/lib/filter'
import { addMonths, currentMonthKey } from '@/lib/monthKey'
import { useTranslations } from '@/lib/i18n/client'

export interface AssetOption {
  id: string
  name: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
}

interface Props {
  open: boolean
  /** Current applied filter — used to seed the draft when the sheet opens. */
  currentFilter: TxnFilter
  /**
   * Current applied date range. When omitted, the sheet runs in "lite mode" —
   * the date section, the愛物 section, and the share-link affordance are
   * hidden. Used by /dashboard, which has only an in-memory payer/split/cat
   * filter and no per-page date scope.
   */
  currentDateRange?: DateRange
  /** Fallback monthKey for the "本月" preset. Required iff `currentDateRange` is set. */
  defaultMonthKey?: string
  /** Active assets in the group, used to populate the 愛物 multi-select. Lite-mode = []. */
  assets?: AssetOption[]
  onClose: () => void
  /**
   * Called with the new filter + (optional) date range when the user taps
   * 套用. The sheet does NOT close itself — the parent decides (typically:
   * also call onClose).
   */
  onApply: (next: TxnFilter, nextRange?: DateRange) => void
  /** Called when the user taps 重設 — clears all dimensions back to default. */
  onReset?: () => void
  /**
   * Called with the current draft when the user taps 分享連結. Parent returns
   * a shareable absolute URL (which the sheet writes to the clipboard). When
   * omitted, the share button is hidden (lite mode).
   */
  onShare?: (draft: TxnFilter, draftRange: DateRange) => string
}

type DateRangeMode = 'thisMonth' | 'lastMonth' | 'all' | 'custom'

function dateRangeToMode(r: DateRange, defaultMonthKey: string): DateRangeMode {
  if (r.kind === 'all') return 'all'
  if (r.kind === 'range') return 'custom'
  if (r.monthKey === defaultMonthKey) return 'thisMonth'
  if (r.monthKey === addMonths(defaultMonthKey, -1)) return 'lastMonth'
  return 'custom'
}

function todayIso(): string {
  // Asia/Taipei calendar day. We render in TW only, so deriving from local
  // browser date is acceptable; using Intl avoids tz-edge bugs on the date
  // input default value.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).formatToParts(new Date())
  const y = parts.find(p => p.type === 'year')?.value ?? '1970'
  const m = parts.find(p => p.type === 'month')?.value ?? '01'
  const d = parts.find(p => p.type === 'day')?.value ?? '01'
  return `${y}-${m}-${d}`
}

export function FilterSheet({
  open,
  currentFilter,
  currentDateRange,
  defaultMonthKey,
  assets,
  onClose,
  onApply,
  onReset,
  onShare,
}: Props) {
  const { isSolo } = useMember()
  const t = useTranslations()

  // Lite mode: no date range / asset / share when the parent doesn't provide
  // the prerequisite props. Used by /dashboard where the filter is in-memory
  // only and there's no per-page date scope.
  const liteMode = currentDateRange === undefined
  const effectiveDefaultMonthKey = defaultMonthKey ?? currentMonthKey()
  const effectiveAssets = assets ?? []

  const [draft, setDraft] = useState<TxnFilter>(currentFilter)
  const [draftMode, setDraftMode] = useState<DateRangeMode>(
    currentDateRange ? dateRangeToMode(currentDateRange, effectiveDefaultMonthKey) : 'thisMonth',
  )
  const [customStart, setCustomStart] = useState<string>(
    currentDateRange?.kind === 'range' ? currentDateRange.start : todayIso(),
  )
  const [customEnd, setCustomEnd] = useState<string>(
    currentDateRange?.kind === 'range' ? currentDateRange.end : todayIso(),
  )
  /**
   * Amount-range inputs are kept as text strings so the user can hold an
   * intermediate empty state without losing focus. Parsing happens at apply
   * time: '' → null (open), valid non-negative int → number, anything else
   * → null (silently dropped, matches the URL parser's behavior).
   */
  const [amountMinText, setAmountMinText] = useState<string>(
    currentFilter.amountMin === null ? '' : String(currentFilter.amountMin),
  )
  const [amountMaxText, setAmountMaxText] = useState<string>(
    currentFilter.amountMax === null ? '' : String(currentFilter.amountMax),
  )
  const [shareToast, setShareToast] = useState('')

  const PAYER_OPTIONS: { value: PayerFilter; label: string }[] = [
    { value: 'all',    label: t.common.all },
    { value: 'mine',   label: t.common.me },
    { value: 'theirs', label: t.common.partner },
  ]

  const SPLIT_OPTIONS: { value: SplitFilter; label: string }[] = [
    { value: 'all',         label: t.common.all },
    { value: 'weighted',    label: t.splitType.weighted },
    { value: 'half',        label: t.splitType.even },
    { value: 'all_mine',    label: t.splitType.mine },
    { value: 'all_theirs',  label: t.splitType.theirs },
  ]

  const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all',     label: t.common.all },
    { value: 'pending', label: t.filterSheet.statusPending },
    { value: 'settled', label: t.filterSheet.statusSettled },
  ]

  // Re-seed the draft whenever the sheet (re-)opens — without this, dismissing without
  // applying and reopening would show the stale draft instead of the live state.
  useEffect(() => {
    if (open) {
      setDraft({
        ...currentFilter,
        categories: new Set(currentFilter.categories),
        incomeCategories: new Set(currentFilter.incomeCategories),
        assetIds: new Set(currentFilter.assetIds),
      })
      setAmountMinText(currentFilter.amountMin === null ? '' : String(currentFilter.amountMin))
      setAmountMaxText(currentFilter.amountMax === null ? '' : String(currentFilter.amountMax))
      if (currentDateRange) {
        setDraftMode(dateRangeToMode(currentDateRange, effectiveDefaultMonthKey))
        if (currentDateRange.kind === 'range') {
          setCustomStart(currentDateRange.start)
          setCustomEnd(currentDateRange.end)
        }
      }
      setShareToast('')
    }
  }, [open, currentFilter, currentDateRange, effectiveDefaultMonthKey])

  if (!open) return null

  const toggleCategory = (id: CategoryId) => {
    const next = new Set(draft.categories)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft({ ...draft, categories: next })
  }

  const toggleIncomeCategory = (id: IncomeCategoryId) => {
    const next = new Set(draft.incomeCategories)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft({ ...draft, incomeCategories: next })
  }

  const toggleAsset = (id: string) => {
    const next = new Set(draft.assetIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraft({ ...draft, assetIds: next })
  }

  /**
   * Convert the date-range mode + custom inputs into a concrete DateRange.
   * Custom mode rejects an inverted range (start > end) by silently swapping
   * the bounds — easier to recover from a stray tap than blocking the apply.
   */
  const resolveDraftRange = (): DateRange => {
    if (draftMode === 'thisMonth') return { kind: 'month', monthKey: currentMonthKey() }
    if (draftMode === 'lastMonth') return { kind: 'month', monthKey: addMonths(currentMonthKey(), -1) }
    if (draftMode === 'all') return { kind: 'all' }
    const start = customStart <= customEnd ? customStart : customEnd
    const end = customStart <= customEnd ? customEnd : customStart
    return { kind: 'range', start, end }
  }

  /**
   * Parse the text input to a non-negative integer or null. Empty / blank /
   * non-numeric / negative / decimal all collapse to null — matches the URL
   * parser's "tampered = no filter on that dim" contract. Caller still has
   * to clamp the inputs to integers via inputMode/pattern in the UI.
   */
  const parseAmountInput = (s: string): number | null => {
    const trimmed = s.trim()
    if (trimmed === '' || !/^\d+$/.test(trimmed)) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }

  const handleApply = () => {
    const amountMin = parseAmountInput(amountMinText)
    const amountMax = parseAmountInput(amountMaxText)
    onApply({ ...draft, amountMin, amountMax }, liteMode ? undefined : resolveDraftRange())
  }

  const handleReset = () => {
    setDraft({
      payer: 'all',
      split: 'all',
      categories: new Set(),
      incomeCategories: new Set(),
      assetIds: new Set(),
      amountMin: null,
      amountMax: null,
      status: 'all',
    })
    setAmountMinText('')
    setAmountMaxText('')
    setDraftMode('thisMonth')
    onReset?.()
  }

  const handleShare = async () => {
    if (!onShare) return
    // Share the same draft the user would Apply — including the live
    // amount-range input, not the pre-edit Set state.
    const amountMin = parseAmountInput(amountMinText)
    const amountMax = parseAmountInput(amountMaxText)
    const url = onShare({ ...draft, amountMin, amountMax }, resolveDraftRange())
    try {
      // navigator.clipboard requires a secure context (https or localhost).
      // Vercel preview / prod / `npm run dev` all qualify, so we don't bother
      // with a textarea fallback for the long-tail case where it doesn't.
      await navigator.clipboard.writeText(url)
      setShareToast(t.filterSheet.shareCopied)
    } catch {
      setShareToast(t.filterSheet.shareFailed)
    }
    setTimeout(() => setShareToast(''), 2400)
  }

  return (
    <>
      <SheetBackdrop open={open} onClick={onClose} />
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-[100] rounded-t-[24px] pb-6"
        style={{ background: 'var(--bg)', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }}
      >
        {/* Header: 重設 / 篩選 / 套用 */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid var(--hairline)' }}
        >
          <button
            onClick={handleReset}
            className="text-sm font-medium bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--ink-2)' }}
          >
            {t.filterSheet.reset}
          </button>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.filterSheet.title}</div>
          <button
            onClick={handleApply}
            className="text-sm font-semibold bg-transparent border-0 cursor-pointer"
            style={{ color: 'var(--accent)' }}
          >
            {t.filterSheet.apply}
          </button>
        </div>

        <div className="px-5 pt-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 日期範圍 — presets + custom. Hidden in lite mode (Dashboard).
              Custom inputs only render when the custom preset is selected so
              the section stays compact in the common case (本月 / 上月). */}
          {!liteMode && (
            <Section title={t.filterSheet.dateSection}>
              {([
                { value: 'thisMonth' as const, label: t.filterSheet.dateThisMonth },
                { value: 'lastMonth' as const, label: t.filterSheet.dateLastMonth },
                { value: 'all'       as const, label: t.filterSheet.dateAll },
                { value: 'custom'    as const, label: t.filterSheet.dateCustom },
              ]).map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={draftMode === o.value}
                  onClick={() => setDraftMode(o.value)}
                />
              ))}
            </Section>
          )}
          {!liteMode && draftMode === 'custom' && (
            <div className="flex items-center gap-2 -mt-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                aria-label={t.filterSheet.dateCustomStart}
                className="h-9 px-2 rounded-lg text-sm flex-1"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
              />
              <span style={{ color: 'var(--ink-3)' }}>→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                aria-label={t.filterSheet.dateCustomEnd}
                className="h-9 px-2 rounded-lg text-sm flex-1"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          )}

          {/* 誰付的 + 分攤 — pair-mode only. In solo, payer is always self and split is
              always all_mine, so these dimensions are degenerate (every row matches). */}
          {!isSolo && (
            <Section title={t.filterSheet.payerSection}>
              {PAYER_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={draft.payer === o.value}
                  onClick={() => setDraft({ ...draft, payer: o.value })}
                />
              ))}
            </Section>
          )}

          {!isSolo && (
            <Section title={t.filterSheet.splitSection}>
              {SPLIT_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  active={draft.split === o.value}
                  onClick={() => setDraft({ ...draft, split: o.value })}
                />
              ))}
            </Section>
          )}

          {/* 愛物 (multi). Always shows the「未歸屬」chip so the user can
              isolate transactions that haven't been linked to anything.
              Empty group has no chips besides 未歸屬 — that's intended;
              an empty愛物 section reads as "you haven't created any 愛物 yet"
              without an extra empty-state line. Hidden in lite mode. */}
          {!liteMode && (
            <Section title={t.filterSheet.assetSection}>
              <Chip
                label={t.filterSheet.assetNone}
                active={draft.assetIds.has(ASSET_FILTER_NONE)}
                onClick={() => toggleAsset(ASSET_FILTER_NONE)}
              />
              {effectiveAssets.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  active={draft.assetIds.has(a.id)}
                  onClick={() => toggleAsset(a.id)}
                />
              ))}
            </Section>
          )}

          {/* 狀態 (single-select) — pending / settled / all. Settlements +
              income are always 'settled' (filter.status='pending' drops them).
              Always rendered, including lite mode — pending tags exist in solo
              groups too, so the filter is meaningful regardless of pair-mode. */}
          <Section title={t.filterSheet.statusSection}>
            {STATUS_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={draft.status === o.value}
                onClick={() => setDraft({ ...draft, status: o.value })}
              />
            ))}
          </Section>

          {/* 金額範圍 — inclusive min/max in NT$ (integers; no decimals).
              Empty input on either side = open bound. Applies to all kinds
              (cash / settlement / income), so it stays visible in lite mode. */}
          <Section title={t.filterSheet.amountSection}>
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amountMinText}
                onChange={(e) => setAmountMinText(e.target.value)}
                placeholder={t.filterSheet.amountMinPlaceholder}
                aria-label={t.filterSheet.amountMinLabel}
                className="h-9 px-2 rounded-lg text-sm flex-1 min-w-0"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
              />
              <span style={{ color: 'var(--ink-3)' }}>→</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amountMaxText}
                onChange={(e) => setAmountMaxText(e.target.value)}
                placeholder={t.filterSheet.amountMaxPlaceholder}
                aria-label={t.filterSheet.amountMaxLabel}
                className="h-9 px-2 rounded-lg text-sm flex-1 min-w-0"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          </Section>

          {/* 分類 (multi) — expense vocabulary. */}
          <Section title={t.filterSheet.categorySection}>
            {PICKABLE_CATEGORIES.map((c) => (
              <Chip
                key={c.id}
                label={t.category[c.id]}
                active={draft.categories.has(c.id)}
                onClick={() => toggleCategory(c.id)}
              />
            ))}
          </Section>

          {/* 收入分類 (multi) — separate vocabulary from expense categories.
              Cross-kind cut rule: picking only an expense cat drops income
              rows; picking only an income cat drops cash rows; picking both
              shows both kinds, each filtered to its own cat set. Hidden in
              lite mode (the Dashboard /dashboard FilterSheet is in-memory
              and only handles cash transactions). */}
          {!liteMode && (
            <Section title={t.filterSheet.incomeCategorySection}>
              {PICKABLE_INCOME_CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  label={t.incomeCategory[c.id]}
                  active={draft.incomeCategories.has(c.id)}
                  onClick={() => toggleIncomeCategory(c.id)}
                />
              ))}
            </Section>
          )}

          {/* Share link — surfaces the "this view is shareable" affordance.
              Sits below the dimensions because it acts on the *draft*, not on
              what's currently applied (you might want to share a specific
              filter combo without applying it locally first). Hidden in lite
              mode (Dashboard's filter is in-memory and not URL-synced). */}
          {onShare && (
            <div className="pt-2 pb-4">
              <button
                type="button"
                onClick={handleShare}
                className="w-full h-10 rounded-[12px] text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--ink-2)',
                  border: '1px solid var(--hairline)',
                }}
              >
                <span aria-hidden style={{ fontSize: 13 }}>↗</span>
                {t.filterSheet.shareLink}
              </button>
              {shareToast && (
                <div
                  className="text-xs text-center mt-2"
                  style={{ color: 'var(--ink-3)' }}
                  role="status"
                  aria-live="polite"
                >
                  {shareToast}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium mb-2" style={{ color: 'var(--ink-3)' }}>{title}</div>
      <div className="flex gap-2 flex-wrap">{children}</div>
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded-full text-xs font-medium cursor-pointer transition-colors"
      style={{
        background: active ? 'var(--ink)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--ink-2)',
        border: '1px solid var(--hairline)',
      }}
    >
      {label}
    </button>
  )
}
