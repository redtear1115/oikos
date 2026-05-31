'use client'

import { useEffect, useState } from 'react'
import { SheetFrame } from './SheetFrame'
import { SheetBody } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/TextInput'
import { AmountInput } from './AmountInput'
import { ScrollFadeRow } from './ScrollFadeRow'
import { ConfirmModal } from './ConfirmModal'
import { Avatar } from './Avatar'
import { useMember, whoToMemberRole } from './MemberContext'
import { IncomeChip } from '@/app/(dashboard)/dashboard/_components/IncomeChip'
import { PayerToggle } from '@/app/(dashboard)/dashboard/_components/PayerToggle'
import { SplitTypeSelector } from '@/app/(dashboard)/dashboard/_components/SplitTypeSelector'
import { AssetLinkField } from '@/app/(dashboard)/dashboard/_components/AssetLinkField'
import { DayPicker } from '@/app/(dashboard)/settings/recurring-income/_components/DayPicker'
import * as incomeActions from '@/actions/recurringIncome'
import * as expenseActions from '@/actions/recurringExpense'
import { PICKABLE_INCOME_CATEGORIES } from '@/lib/incomeCategories'
import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'
import { useRecurringRuleForm } from '@/lib/hooks/useRecurringRuleForm'
import type { SplitType } from '@/lib/balance'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'
import type { RecurringExpenseRuleRow } from '@/lib/db/queries/recurringExpense'
import { loadedSplitRatioToViewerShare, toMemberAShare } from '@/lib/splitRatio'

const INTERVAL_VALUES: (1 | 3 | 6 | 12)[] = [1, 3, 6, 12]
const P = DEFAULT_INCOME_PALETTE

type CommonProps = {
  open: boolean
  onClose: () => void
  onMutated: () => void
}

type IncomeProps = CommonProps & {
  type: 'income'
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

type ExpenseProps = CommonProps & {
  type: 'expense'
  initial?: RecurringExpenseRuleRow
  groupDefaultRatioA?: number | null
}

type Props = IncomeProps | ExpenseProps

export function RecurringRuleSheet(props: Props) {
  const { open, onClose, onMutated } = props
  const { viewer, partner, isSolo, viewerIsA } = useMember()
  const t = useTranslations()
  const isEdit = !!props.initial
  const isIncome = props.type === 'income'

  const actions = isIncome ? incomeActions : expenseActions
  const tNs = isIncome ? t.recurringIncome : t.recurringExpense

  const intervalLabels: Record<1 | 3 | 6 | 12, string> = {
    1: tNs.rule.intervalEveryMonth,
    3: tNs.rule.intervalEveryQuarter,
    6: tNs.rule.intervalEveryHalfYear,
    12: tNs.rule.intervalEveryYear,
  }

  const form = useRecurringRuleForm({
    open,
    initial: props.initial,
    actions: {
      pauseRule: actions.pauseRule,
      resumeRule: actions.resumeRule,
      softDeleteRule: actions.softDeleteRule,
    },
    errorMessages: {
      operationFailed: tNs.errors.operationFailed,
      deleteFailed: tNs.errors.deleteFailed,
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

  // Domain-specific state. We keep two side-by-side state shapes (income vs
  // expense) rather than one merged union so each render-path only touches
  // the fields it actually needs. The unused side is inert mounted state.
  const [incomeCategory, setIncomeCategory] = useState('salary')
  const [recipientWho, setRecipientWho] = useState<'M' | 'T'>('M')
  const [source, setSource] = useState('')
  const [incomeAssetId, setIncomeAssetId] = useState('')

  const [expenseCategory, setExpenseCategory] = useState<CategoryId>('housing')
  const [payerWho, setPayerWho] = useState<'M' | 'T'>('M')
  const [splitType, setSplitType] = useState<SplitType>('half')
  const [splitRatioA, setSplitRatioA] = useState<number>(50)
  const [description, setDescription] = useState('')
  const [expenseAssetId, setExpenseAssetId] = useState<string | null>(null)

  // Reset / prefill on open — income variant
  const incomeInitial = isIncome ? props.initial : undefined
  const incomePrefill = isIncome ? props.prefill : undefined
  useEffect(() => {
    if (!open || !isIncome) return
    if (incomeInitial) {
      setIncomeCategory(incomeInitial.category)
      setRecipientWho(incomeInitial.recipientId === viewer.id ? 'M' : 'T')
      setSource(incomeInitial.source ?? '')
      setIncomeAssetId(incomeInitial.assetId ?? '')
    } else {
      // #166 — prefill from caller (e.g. SavingsView) wins over defaults so
      // a one-tap "set up recurring from this savings policy" flow lands on
      // sensible values; user can still change anything before saving.
      setIncomeCategory(incomePrefill?.category ?? 'salary')
      setRecipientWho('M')
      setSource(incomePrefill?.source ?? '')
      setIncomeAssetId(incomePrefill?.assetId ?? '')
    }
  }, [open, isIncome, incomeInitial, viewer.id, incomePrefill?.assetId, incomePrefill?.category, incomePrefill?.source])

  // Reset / prefill on open — expense variant
  const expenseInitial = !isIncome ? props.initial : undefined
  const groupDefaultRatioA = !isIncome ? props.groupDefaultRatioA : null
  useEffect(() => {
    if (!open || isIncome) return
    if (expenseInitial) {
      setExpenseCategory(
        PICKABLE_CATEGORIES.find((c) => c.id === expenseInitial.category)?.id ?? 'other',
      )
      setPayerWho(expenseInitial.paidBy === viewer.id ? 'M' : 'T')
      setSplitType(expenseInitial.splitType)
      // DB stores member A's share; slider tracks viewer's share. Flip for
      // viewer = B so the labels read truthfully (#783 / PR #784).
      setSplitRatioA(
        loadedSplitRatioToViewerShare(expenseInitial.splitRatioA, viewerIsA, groupDefaultRatioA ?? 50),
      )
      setDescription(expenseInitial.description)
      setExpenseAssetId(expenseInitial.assetId)
    } else {
      setExpenseCategory('housing')
      setPayerWho('M')
      setSplitType(isSolo ? 'all_mine' : viewer.defaultSplitType)
      setSplitRatioA(groupDefaultRatioA ?? 50)
      setDescription('')
      setExpenseAssetId(null)
    }
  }, [open, isIncome, expenseInitial, viewer.id, viewer.defaultSplitType, isSolo, groupDefaultRatioA, viewerIsA])

  const handleSave = () => {
    if (!amount || amount <= 0) { setError(tNs.errors.amountRequired); return }

    if (isIncome) {
      setError(null)
      const recipientId = isSolo
        ? viewer.id
        : recipientWho === 'M'
          ? viewer.id
          : (partner?.id ?? viewer.id)
      const payload = {
        amount,
        category: incomeCategory,
        recipientId,
        intervalMonths,
        dayOfMonth,
        startsOn,
        endsOn: endsOn || null,
        source: source.trim() || null,
        assetId: incomeAssetId || null,
      }
      runSubmit(
        () => props.initial?.id
          ? incomeActions.updateRule({ id: props.initial.id, ...payload })
          : incomeActions.createRule(payload),
        t.recurringIncome.errors.saveFailed,
      )
      return
    }

    if (!description.trim()) { setError(t.recurringExpense.errors.descriptionRequired); return }
    setError(null)
    const paidBy = isSolo
      ? viewer.id
      : payerWho === 'M'
        ? viewer.id
        : (partner?.id ?? viewer.id)
    const effectiveSplit: SplitType = isSolo ? 'all_mine' : splitType
    const payload = {
      amount,
      category: expenseCategory,
      paidBy,
      splitType: effectiveSplit,
      // Form state is the viewer's share; DB column stores member A's share.
      splitRatioA: effectiveSplit === 'weighted' ? toMemberAShare(splitRatioA, viewerIsA) : null,
      description: description.trim(),
      intervalMonths,
      dayOfMonth,
      startsOn,
      endsOn: endsOn || null,
      assetId: expenseAssetId || null,
    }
    runSubmit(
      () => props.initial?.id
        ? expenseActions.updateRule({ id: props.initial.id, ...payload })
        : expenseActions.createRule(payload),
      t.recurringExpense.errors.saveFailed,
    )
  }

  const saveColor = isIncome ? P.ink : 'var(--accent)'
  const saveDisabled = !amount || pending

  return (
    <>
      <SheetFrame
        open={open}
        onClose={onClose}
        ariaLabel={isEdit ? tNs.sheet.titleEdit : tNs.sheet.titleNew}
        background={isIncome ? P.sheetBg : undefined}
        boxShadow={isIncome ? '0 -10px 40px rgba(58,36,25,0.18)' : undefined}
        grabberColor="var(--grabber)"
      >
        {isIncome && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 80,
              background: `radial-gradient(120% 80% at 50% 0%, ${P.glow} 0%, transparent 70%)`,
              opacity: 0.7,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Header — 3-column layout (cancel | centred title | save); non-standard for SheetHeader primitive */}
        <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2 relative">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
            {isEdit ? tNs.sheet.titleEdit : tNs.sheet.titleNew}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={saveDisabled}
            style={{
              color: amount && !pending ? saveColor : 'var(--ink-3)',
              fontWeight: 600,
            }}
          >
            {pending ? t.common.saving : t.common.save}
          </Button>
        </div>

        <SheetBody noPadding>
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
          <div className="text-center px-6 pt-6 pb-5">
            <div className="text-xs text-ink-3 tracking-label mb-3">
              {tNs.sheet.amountLabel}
            </div>
            <AmountInput
              value={amount ? String(amount) : ''}
              onChange={(next) => setAmount(next ? parseInt(next, 10) : 0)}
              symbol="NT$"
              ariaLabel={tNs.sheet.amountLabel}
              caretColor={isIncome ? P.ink : undefined}
            />

            {/* Payer / recipient toggle. Expense uses the shared PayerToggle's
                visual; income inlines a sibling variant so the active thumb
                can wear a palette-tinted ring. */}
            {!isSolo && (
              isIncome ? (
                <div
                  className="flex items-center justify-center gap-2.5 text-sm"
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
                        className="oik-segment h-7 px-3.5 rounded-full border-0 text-sm font-medium cursor-pointer flex items-center gap-1.5"
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
              ) : (
                <PayerToggle value={payerWho} onChange={setPayerWho} />
              )
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'linear-gradient(90deg, transparent, var(--hairline), transparent)' }} />

          {/* Description (expense only, required) */}
          {!isIncome && (
            <>
              <div className="px-5 py-3.5">
                <div className="text-xs text-ink-3 tracking-label mb-2">
                  {t.recurringExpense.sheet.descriptionLabel}
                </div>
                <TextInput
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.recurringExpense.sheet.descriptionPlaceholder}
                />
              </div>
              <div className="oik-hairline" />
            </>
          )}

          {/* Category */}
          <div className="pt-[18px] pb-4">
            <div className="text-xs text-ink-3 tracking-label px-5 pb-3">
              {tNs.sheet.categoryLabel}
            </div>
            {isIncome ? (
              <ScrollFadeRow className="flex gap-2" style={{ padding: '0 20px' }} fadeTo={P.sheetBg}>
                {PICKABLE_INCOME_CATEGORIES.map((c) => (
                  <IncomeChip
                    key={c.id}
                    cat={c}
                    selected={incomeCategory === c.id}
                    onClick={() => setIncomeCategory(c.id)}
                  />
                ))}
              </ScrollFadeRow>
            ) : (
              <ScrollFadeRow className="flex gap-2" style={{ padding: '0 20px' }}>
                {PICKABLE_CATEGORIES.map((c) => {
                  const sel = expenseCategory === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setExpenseCategory(c.id)}
                      className="h-[38px] pl-2 pr-3 rounded-full text-sm font-medium inline-flex items-center gap-2 cursor-pointer shrink-0 transition-all duration-150"
                      style={{
                        background: sel ? 'var(--ink)' : 'var(--surface)',
                        color: sel ? 'var(--on-fill)' : 'var(--ink)',
                        border: sel ? '1px solid var(--ink)' : '1px solid var(--hairline)',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        className="w-6 h-6 rounded-[7px] inline-flex items-center justify-center text-sm font-medium"
                        style={{ background: c.tint, color: c.ink }}
                      >
                        {c.mono}
                      </span>
                      {t.category[c.id]}
                    </button>
                  )
                })}
              </ScrollFadeRow>
            )}
          </div>

          {/* Split type (expense only, non-solo) */}
          {!isIncome && !isSolo && (
            <>
              <div className="oik-hairline" />
              <div className="px-5 pt-[18px] pb-4">
                <div className="text-xs text-ink-3 tracking-label mb-3">
                  {t.recurringExpense.sheet.splitTypeLabel}
                </div>
                <SplitTypeSelector
                  value={splitType}
                  onChange={setSplitType}
                  amount={amount}
                  payerWho={payerWho}
                  splitRatioA={splitRatioA}
                  onSplitRatioAChange={setSplitRatioA}
                />
              </div>
            </>
          )}

          <div className="oik-hairline" />

          {/* Interval */}
          <div className="px-5 pt-[18px] pb-4">
            <div className="text-xs text-ink-3 tracking-label mb-3">
              {tNs.sheet.intervalLabel}
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
                    color: intervalMonths === v ? 'var(--on-fill)' : 'var(--ink)',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {intervalLabels[v]}
                </button>
              ))}
            </div>
          </div>

          <div className="oik-hairline" />

          {/* Day of month */}
          <div className="px-5 pt-[18px] pb-4">
            <div className="text-xs text-ink-3 tracking-label mb-3">
              {tNs.sheet.dayOfMonthLabel}
            </div>
            <DayPicker value={dayOfMonth} onChange={setDayOfMonth} />
            {dayOfMonth > 28 && (
              <div
                className="mt-2 text-xs"
                style={{ color: 'var(--ink-3)' }}
              >
                {tNs.sheet.dayOfMonthFallbackHint}
              </div>
            )}
          </div>

          <div style={{ height: 1, margin: '0 20px', background: 'var(--hairline)' }} />

          {/* Source (income only) */}
          {isIncome && (
            <div className="px-5 py-3.5">
              <div className="text-xs text-ink-3 tracking-label mb-2">
                {t.recurringIncome.sheet.sourceLabel}
              </div>
              <TextInput
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t.recurringIncome.sheet.sourcePlaceholder}
              />
            </div>
          )}

          {/* Start / end dates */}
          <div className="grid grid-cols-2 gap-3 px-5 pt-3.5 pb-4">
            <label>
              <div className="text-xs text-ink-3 tracking-label mb-2">
                {tNs.sheet.startsOnLabel}
              </div>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="w-full bg-transparent outline-none rounded-chip px-2.5 py-2 text-sm"
                style={{
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
            <label>
              <div className="text-xs text-ink-3 tracking-label mb-2">
                {tNs.sheet.endsOnLabel}
              </div>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="w-full bg-transparent outline-none rounded-chip px-2.5 py-2 text-sm"
                style={{
                  border: '1px solid var(--hairline)',
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                }}
              />
            </label>
          </div>

          {/* Asset link. Income: insurance-only <select>; expense: generic AssetLinkField. */}
          {isIncome ? (
            props.insuranceAssets.length > 0 && (
              <>
                <div className="oik-hairline" />
                <div className="px-5 pt-3.5 pb-4">
                  <div className="text-xs text-ink-3 tracking-label mb-2">
                    {t.recurringIncome.sheet.assetLabel}
                  </div>
                  <select
                    value={incomeAssetId}
                    onChange={(e) => setIncomeAssetId(e.target.value)}
                    className="w-full bg-transparent rounded-chip px-2.5 py-2 text-sm"
                    style={{
                      border: '1px solid var(--hairline)',
                      color: 'var(--ink)',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="">{t.recurringIncome.sheet.assetNone}</option>
                    {props.insuranceAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )
          ) : (
            <>
              <div className="oik-hairline" />
              <div className="px-5 pt-3.5 pb-4">
                <div className="text-xs text-ink-3 tracking-label mb-2">
                  {t.recurringExpense.sheet.assetLabel}
                </div>
                <AssetLinkField value={expenseAssetId} onChange={setExpenseAssetId} open={open} />
              </div>
            </>
          )}

          {/* Edit-mode actions */}
          {isEdit && (
            <>
              <div className="oik-hairline mt-2" />
              <div className="flex gap-2.5 px-5 pt-4 pb-2">
                <Button
                  variant="secondary"
                  onClick={handlePauseResume}
                  disabled={pending}
                  fullWidth
                >
                  {isPaused ? tNs.sheet.resumeAction : tNs.sheet.pauseAction}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={pending}
                  fullWidth
                >
                  {tNs.sheet.deleteRuleAction}
                </Button>
              </div>
            </>
          )}

          <div className="h-8" />
        </SheetBody>
      </SheetFrame>

      <ConfirmModal
        open={confirmingDelete && open}
        title={tNs.sheet.deleteConfirmTitle}
        description={tNs.sheet.deleteConfirmDescription}
        confirmLabel={t.common.delete}
        pending={pending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
