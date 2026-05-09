'use client'

import { useEffect, useState, useTransition } from 'react'
import { SheetBackdrop } from '@/app/(dashboard)/dashboard/_components/SheetBackdrop'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { PayerToggle } from '@/app/(dashboard)/dashboard/_components/PayerToggle'
import { SplitTypeSelector } from '@/app/(dashboard)/dashboard/_components/SplitTypeSelector'
import { AssetLinkField } from '@/app/(dashboard)/dashboard/_components/AssetLinkField'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { DayPicker } from '@/app/(dashboard)/settings/recurring-income/_components/DayPicker'
import {
  createRule,
  updateRule,
  softDeleteRule,
  pauseRule,
  resumeRule,
} from '@/actions/recurringExpense'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import type { SplitType } from '@/lib/balance'
import { localTodayISO } from '@/lib/local-date'
import { useTranslations } from '@/lib/i18n/client'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'

const INTERVAL_VALUES: (1 | 3 | 6 | 12)[] = [1, 3, 6, 12]

interface Props {
  open: boolean
  onClose: () => void
  onMutated: () => void
  /** undefined = create mode; set = edit mode */
  initial?: RecurringExpenseRuleRow
}

export function RecurringRuleSheet({
  open,
  onClose,
  onMutated,
  initial,
}: Props) {
  const { viewer, partner, isSolo } = useMember()
  const t = useTranslations()
  const isEdit = !!initial

  const intervalLabels: Record<1 | 3 | 6 | 12, string> = {
    1: t.recurringExpense.rule.intervalEveryMonth,
    3: t.recurringExpense.rule.intervalEveryQuarter,
    6: t.recurringExpense.rule.intervalEveryHalfYear,
    12: t.recurringExpense.rule.intervalEveryYear,
  }

  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState<CategoryId>('housing')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [splitType, setSplitType] = useState<SplitType>('half')
  const [description, setDescription] = useState('')
  const [intervalMonths, setIntervalMonths] = useState<1 | 3 | 6 | 12>(1)
  const [dayOfMonth, setDayOfMonth] = useState(new Date().getDate())
  const [startsOn, setStartsOn] = useState(localTodayISO())
  const [endsOn, setEndsOn] = useState('')
  const [assetId, setAssetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    if (initial) {
      setAmount(initial.amount)
      setCategory(
        (PICKABLE_CATEGORIES.find((c) => c.id === initial.category)?.id as CategoryId) ?? 'other',
      )
      setPayerWho(initial.paidBy === viewer.id ? 'M' : 'T')
      setSplitType(initial.splitType)
      setDescription(initial.description)
      setIntervalMonths(initial.intervalMonths as 1 | 3 | 6 | 12)
      setDayOfMonth(initial.dayOfMonth)
      setStartsOn(initial.startsOn)
      setEndsOn(initial.endsOn ?? '')
      setAssetId(initial.assetId)
    } else {
      setAmount(0)
      setCategory('housing')
      setPayerWho('M')
      setSplitType(isSolo ? 'all_mine' : viewer.defaultSplitType)
      setDescription('')
      setIntervalMonths(1)
      setDayOfMonth(new Date().getDate())
      setStartsOn(localTodayISO())
      setEndsOn('')
      setAssetId(null)
    }
    setError(null)
    setConfirmingDelete(false)
  }, [open, initial, viewer.id, viewer.defaultSplitType, isSolo])

  const paidBy = isSolo
    ? viewer.id
    : payerWho === 'M'
      ? viewer.id
      : (partner?.id ?? viewer.id)

  const effectiveSplit: SplitType = isSolo ? 'all_mine' : splitType

  const handleSave = () => {
    if (!amount || amount <= 0) { setError(t.recurringExpense.errors.amountRequired); return }
    if (!description.trim()) { setError(t.recurringExpense.errors.descriptionRequired); return }
    setError(null)
    const payload = {
      amount,
      category,
      paidBy,
      splitType: effectiveSplit,
      description: description.trim(),
      intervalMonths,
      dayOfMonth,
      startsOn,
      endsOn: endsOn || null,
      assetId: assetId || null,
    }
    startTransition(async () => {
      try {
        if (initial?.id) await updateRule({ id: initial.id, ...payload })
        else await createRule(payload)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : t.recurringExpense.errors.saveFailed)
      }
    })
  }

  const handlePauseResume = () => {
    if (!initial?.id) return
    const isPaused = !!initial.pausedAt
    startTransition(async () => {
      try {
        if (isPaused) await resumeRule(initial.id)
        else await pauseRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : t.recurringExpense.errors.operationFailed)
      }
    })
  }

  const handleDelete = () => {
    if (!initial?.id) return
    setConfirmingDelete(false)
    startTransition(async () => {
      try {
        await softDeleteRule(initial.id)
        onMutated()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : t.recurringExpense.errors.deleteFailed)
      }
    })
  }

  const isPaused = !!initial?.pausedAt

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
        <div className="pt-2 flex justify-center relative">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'var(--grabber)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 relative">
          <button
            type="button" onClick={onClose}
            className="bg-transparent border-0 text-body cursor-pointer p-1"
            style={{ color: 'var(--ink-2)', fontFamily: 'inherit' }}
          >
            {t.common.cancel}
          </button>
          <div className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {isEdit ? t.recurringExpense.sheet.titleEdit : t.recurringExpense.sheet.titleNew}
          </div>
          <button
            type="button" onClick={handleSave} disabled={!amount || pending}
            className="bg-transparent border-0 text-body font-semibold cursor-pointer p-1 disabled:cursor-default transition-colors duration-150"
            style={{ color: amount && !pending ? 'var(--accent)' : 'var(--ink-3)', fontFamily: 'inherit' }}
          >
            {pending ? t.common.saving : t.common.save}
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {error && (
            <div
              role="alert"
              className="sticky top-0 z-10 mx-5 mt-2 px-4 py-3 rounded-xl text-sm text-white"
              style={{ background: 'var(--debit)', boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
            >
              {error}
            </div>
          )}

          {/* Amount */}
          <div className="text-center" style={{ padding: '24px 24px 20px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              {t.recurringExpense.sheet.amountLabel}
            </div>
            <label className="flex items-baseline justify-center gap-2 cursor-text">
              <span className="text-title font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                value={amount ? amount.toLocaleString('en-US') : ''}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 7).replace(/^0+(\d)/, '$1')
                  setAmount(next ? parseInt(next, 10) : 0)
                }}
                placeholder="0"
                aria-label={t.recurringExpense.sheet.amountLabel}
                className="bg-transparent border-0 outline-none text-center"
                style={{
                  fontFamily: 'var(--font-numeric)',
                  fontSize: 'var(--fs-amount-lg)',
                  fontWeight: 600,
                  color: amount ? 'var(--ink)' : 'var(--ink-3)',
                  letterSpacing: -2,
                  lineHeight: 1,
                  width: `${Math.max((amount ? amount.toLocaleString('en-US').length : 1), 2)}ch`,
                  caretColor: 'var(--accent)',
                }}
              />
            </label>

            {!isSolo && (
              <PayerToggle value={payerWho} onChange={setPayerWho} />
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'linear-gradient(90deg, transparent, var(--hairline), transparent)' }} />

          {/* Description (required) */}
          <div style={{ padding: '14px 20px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 8,
              }}
            >
              {t.recurringExpense.sheet.descriptionLabel}
            </div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.recurringExpense.sheet.descriptionPlaceholder}
              className="w-full bg-transparent outline-none"
              style={{
                border: 'none',
                borderBottom: '1px solid var(--hairline)',
                padding: '4px 0 8px',
                fontSize: 'var(--fs-body)',
                color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Category */}
          <div style={{ padding: '18px 0 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, padding: '0 20px 12px',
              }}
            >
              {t.recurringExpense.sheet.categoryLabel}
            </div>
            <div
              className="flex gap-2"
              style={{ padding: '0 20px', overflowX: 'auto', scrollbarWidth: 'none' }}
            >
              {PICKABLE_CATEGORIES.map((c) => {
                const sel = category === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className="h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
                    style={{
                      background: sel ? 'var(--ink)' : 'var(--surface)',
                      color: sel ? '#fff' : 'var(--ink)',
                      border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-label font-medium"
                      style={{ background: c.tint, color: c.ink }}
                    >
                      {c.mono}
                    </span>
                    {t.category[c.id]}
                  </button>
                )
              })}
            </div>
          </div>

          {!isSolo && (
            <>
              <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />
              <div style={{ padding: '18px 20px 16px' }}>
                <div
                  style={{
                    fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                    letterSpacing: 1.2, marginBottom: 12,
                  }}
                >
                  {t.recurringExpense.sheet.splitTypeLabel}
                </div>
                <SplitTypeSelector
                  value={splitType}
                  onChange={setSplitType}
                  amount={amount}
                  payerWho={payerWho}
                />
              </div>
            </>
          )}

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Interval */}
          <div style={{ padding: '18px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              {t.recurringExpense.sheet.intervalLabel}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {INTERVAL_VALUES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setIntervalMonths(v)}
                  className="rounded-full py-2 text-sm"
                  style={{
                    border: `1px solid ${intervalMonths === v ? 'var(--ink)' : 'var(--hairline)'}`,
                    background: intervalMonths === v ? 'var(--ink)' : 'transparent',
                    color: intervalMonths === v ? '#fff' : 'var(--ink)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {intervalLabels[v]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Day of month */}
          <div style={{ padding: '18px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              {t.recurringExpense.sheet.dayOfMonthLabel}
            </div>
            <DayPicker value={dayOfMonth} onChange={setDayOfMonth} />
            {dayOfMonth > 28 && (
              <div
                className="mt-2 text-xs"
                style={{ color: 'var(--ink-3)' }}
              >
                {t.recurringExpense.sheet.dayOfMonthFallbackHint}
              </div>
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Start / end dates */}
          <div style={{ padding: '14px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div
                style={{
                  fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                  letterSpacing: 1.2, marginBottom: 8,
                }}
              >
                {t.recurringExpense.sheet.startsOnLabel}
              </div>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <label>
              <div
                style={{
                  fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                  letterSpacing: 1.2, marginBottom: 8,
                }}
              >
                {t.recurringExpense.sheet.endsOnLabel}
              </div>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full bg-transparent outline-none"
                style={{
                  border: '1px solid var(--hairline)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 'var(--fs-sm)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>

          {/* Asset link (optional, any type) */}
          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />
          <div style={{ padding: '14px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 8,
              }}
            >
              {t.recurringExpense.sheet.assetLabel}
            </div>
            <AssetLinkField value={assetId} onChange={setAssetId} open={open} />
          </div>

          {/* Edit-mode actions */}
          {isEdit && (
            <>
              <div style={{ height: 1, margin: '8px 20px 0', background: 'var(--hairline)' }} />
              <div style={{ padding: '16px 20px 8px', display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handlePauseResume}
                  disabled={pending}
                  className="flex-1 py-3 rounded-full text-sm font-medium disabled:opacity-50"
                  style={{
                    border: '1px solid var(--hairline)',
                    color: 'var(--ink-2)',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {isPaused ? t.recurringExpense.sheet.resumeAction : t.recurringExpense.sheet.pauseAction}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  className="flex-1 py-3 rounded-full text-sm font-medium disabled:opacity-50"
                  style={{
                    border: '1px solid var(--destructive)',
                    color: 'var(--destructive)',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {t.recurringExpense.sheet.deleteRuleAction}
                </button>
              </div>
            </>
          )}

          <div className="h-8" />
        </div>
      </div>

      <ConfirmModal
        open={confirmingDelete && open}
        title={t.recurringExpense.sheet.deleteConfirmTitle}
        description={t.recurringExpense.sheet.deleteConfirmDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
