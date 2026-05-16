'use client'

import { useEffect, useState } from 'react'
import { SheetFrame } from '@/app/(dashboard)/_components/SheetFrame'
import { AmountInput } from '@/app/(dashboard)/_components/AmountInput'
import { ScrollFadeRow } from '@/app/(dashboard)/_components/ScrollFadeRow'
import { IncomeChip } from '@/app/(dashboard)/dashboard/_components/IncomeChip'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { Avatar } from '@/app/(dashboard)/_components/Avatar'
import { useMember, whoToMemberRole } from '@/app/(dashboard)/_components/MemberContext'
import { DayPicker } from './DayPicker'
import {
  createRule,
  updateRule,
  softDeleteRule,
  pauseRule,
  resumeRule,
} from '@/actions/recurringIncome'
import { PICKABLE_INCOME_CATEGORIES } from '@/lib/incomeCategories'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { useRecurringRuleForm } from '@/lib/hooks/useRecurringRuleForm'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

const P = DEFAULT_INCOME_PALETTE

const INTERVAL_VALUES: (1 | 3 | 6 | 12)[] = [1, 3, 6, 12]

interface Props {
  open: boolean
  onClose: () => void
  onMutated: () => void
  /** undefined = create mode; set = edit mode */
  initial?: RecurringRuleRow
  insuranceAssets: { id: string; name: string }[]
  /** #166 — create-mode prefill from contexts outside Settings (e.g. SavingsView).
   *  Ignored in edit mode so the rule's own values still win. */
  prefill?: {
    assetId?: string
    category?: string
    source?: string
  }
}

export function RecurringRuleSheet({
  open,
  onClose,
  onMutated,
  initial,
  insuranceAssets,
  prefill,
}: Props) {
  const { viewer, partner, isSolo, viewerIsA } = useMember()
  const t = useTranslations()
  const isEdit = !!initial

  const intervalLabels: Record<1 | 3 | 6 | 12, string> = {
    1: t.recurringIncome.rule.intervalEveryMonth,
    3: t.recurringIncome.rule.intervalEveryQuarter,
    6: t.recurringIncome.rule.intervalEveryHalfYear,
    12: t.recurringIncome.rule.intervalEveryYear,
  }

  const form = useRecurringRuleForm({
    open,
    initial,
    actions: { pauseRule, resumeRule, softDeleteRule },
    errorMessages: {
      operationFailed: t.recurringIncome.errors.operationFailed,
      deleteFailed: t.recurringIncome.errors.deleteFailed,
    },
    onMutated,
    onClose,
  })
  const {
    amount, setAmount,
    intervalMonths, setIntervalMonths,
    dayOfMonth, setDayOfMonth,
    startsOn, setStartsOn,
    endsOn, setEndsOn,
    error, setError,
    confirmingDelete, setConfirmingDelete,
    pending, isPaused,
    handlePauseResume, handleDelete, runSubmit,
  } = form

  const [category, setCategory] = useState('salary')
  const [recipientWho, setRecipientWho] = useState<'M' | 'T'>('M')
  const [source, setSource] = useState('')
  const [assetId, setAssetId] = useState('')

  // Reset / prefill on open
  useEffect(() => {
    if (!open) return
    if (initial) {
      setCategory(initial.category)
      setRecipientWho(initial.recipientId === viewer.id ? 'M' : 'T')
      setSource(initial.source ?? '')
      setAssetId(initial.assetId ?? '')
    } else {
      // #166 — prefill from caller (e.g. SavingsView) wins over defaults so
      // a one-tap "set up recurring from this savings policy" flow lands on
      // sensible values; user can still change anything before saving.
      setCategory(prefill?.category ?? 'salary')
      setRecipientWho('M')
      setSource(prefill?.source ?? '')
      setAssetId(prefill?.assetId ?? '')
    }
  }, [open, initial, viewer.id, prefill?.assetId, prefill?.category, prefill?.source])

  const recipientId = isSolo
    ? viewer.id
    : recipientWho === 'M'
      ? viewer.id
      : (partner?.id ?? viewer.id)

  const handleSave = () => {
    if (!amount || amount <= 0) { setError(t.recurringIncome.errors.amountRequired); return }
    setError(null)
    const payload = {
      amount,
      category,
      recipientId,
      intervalMonths,
      dayOfMonth,
      startsOn,
      endsOn: endsOn || null,
      source: source.trim() || null,
      assetId: assetId || null,
    }
    runSubmit(
      () => initial?.id ? updateRule({ id: initial.id, ...payload }) : createRule(payload),
      t.recurringIncome.errors.saveFailed,
    )
  }

  return (
    <>
      <SheetFrame
        open={open}
        onClose={onClose}
        ariaLabel={isEdit ? t.recurringIncome.sheet.titleEdit : t.recurringIncome.sheet.titleNew}
        background={P.sheetBg}
        boxShadow="0 -10px 40px rgba(58,36,25,0.18)"
        grabberColor="var(--grabber)"
      >
        {/* Halo */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 80,
            background: `radial-gradient(120% 80% at 50% 0%, ${P.glow} 0%, transparent 70%)`,
            opacity: 0.7,
            pointerEvents: 'none',
          }}
        />

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
            {isEdit ? t.recurringIncome.sheet.titleEdit : t.recurringIncome.sheet.titleNew}
          </div>
          <button
            type="button" onClick={handleSave} disabled={!amount || pending}
            className="bg-transparent border-0 text-body font-semibold cursor-pointer p-1 disabled:cursor-default transition-colors duration-150"
            style={{ color: amount && !pending ? P.ink : 'var(--ink-3)', fontFamily: 'inherit' }}
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
              {t.recurringIncome.sheet.amountLabel}
            </div>
            <AmountInput
              value={amount ? String(amount) : ''}
              onChange={(next) => setAmount(next ? parseInt(next, 10) : 0)}
              symbol="NT$"
              ariaLabel={t.recurringIncome.sheet.amountLabel}
              caretColor={P.ink}
            />

            {/* Recipient toggle */}
            {!isSolo && (
              <div
                className="flex items-center justify-center gap-2.5 text-label"
                style={{ marginTop: 18, color: 'var(--ink-2)' }}
              >
                <span>{t.recurringIncome.sheet.recipientPrompt}</span>
                <div
                  className="inline-flex rounded-full p-[3px] gap-0.5"
                  style={{ background: 'var(--toggle-segment-track)' }}
                >
                  {(['M', 'T'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setRecipientWho(w)}
                      className="oik-segment h-7 px-3.5 rounded-full border-0 text-label font-medium cursor-pointer flex items-center gap-1.5"
                      style={{
                        background: recipientWho === w ? 'var(--toggle-segment-thumb)' : 'transparent',
                        color: recipientWho === w ? 'var(--ink)' : 'var(--ink-2)',
                        fontFamily: 'inherit',
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

          <div style={{ height: 1, margin: '0 20px', background: 'linear-gradient(90deg, transparent, var(--hairline), transparent)' }} />

          {/* Category */}
          <div style={{ padding: '18px 0 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, padding: '0 20px 12px',
              }}
            >
              {t.recurringIncome.sheet.categoryLabel}
            </div>
            <ScrollFadeRow className="flex gap-2" style={{ padding: '0 20px' }} fadeTo={P.sheetBg}>
              {PICKABLE_INCOME_CATEGORIES.map((c) => (
                <IncomeChip
                  key={c.id}
                  cat={c}
                  selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                />
              ))}
            </ScrollFadeRow>
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'linear-gradient(90deg, transparent, var(--hairline), transparent)' }} />

          {/* Interval */}
          <div style={{ padding: '18px 20px 16px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 12,
              }}
            >
              {t.recurringIncome.sheet.intervalLabel}
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
              {t.recurringIncome.sheet.dayOfMonthLabel}
            </div>
            <DayPicker value={dayOfMonth} onChange={setDayOfMonth} />
            {dayOfMonth > 28 && (
              <div
                className="mt-2 text-xs"
                style={{ color: 'var(--ink-3)' }}
              >
                {t.recurringIncome.sheet.dayOfMonthFallbackHint}
              </div>
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Source name */}
          <div style={{ padding: '14px 20px' }}>
            <div
              style={{
                fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                letterSpacing: 1.2, marginBottom: 8,
              }}
            >
              {t.recurringIncome.sheet.sourceLabel}
            </div>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t.recurringIncome.sheet.sourcePlaceholder}
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

          {/* Start / end dates */}
          <div style={{ padding: '14px 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <div
                style={{
                  fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                  letterSpacing: 1.2, marginBottom: 8,
                }}
              >
                {t.recurringIncome.sheet.startsOnLabel}
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
                {t.recurringIncome.sheet.endsOnLabel}
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

          {/* Insurance asset link (optional) */}
          {insuranceAssets.length > 0 && (
            <>
              <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />
              <div style={{ padding: '14px 20px 16px' }}>
                <div
                  style={{
                    fontSize: 'var(--fs-micro)', color: 'var(--ink-3)',
                    letterSpacing: 1.2, marginBottom: 8,
                  }}
                >
                  {t.recurringIncome.sheet.assetLabel}
                </div>
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="w-full bg-transparent"
                  style={{
                    border: '1px solid var(--hairline)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    fontSize: 'var(--fs-sm)',
                    color: 'var(--ink)',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">{t.recurringIncome.sheet.assetNone}</option>
                  {insuranceAssets.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

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
                  {isPaused ? t.recurringIncome.sheet.resumeAction : t.recurringIncome.sheet.pauseAction}
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
                  {t.recurringIncome.sheet.deleteRuleAction}
                </button>
              </div>
            </>
          )}

          <div className="h-8" />
        </div>
      </SheetFrame>

      <ConfirmModal
        open={confirmingDelete && open}
        title={t.recurringIncome.sheet.deleteConfirmTitle}
        description={t.recurringIncome.sheet.deleteConfirmDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
