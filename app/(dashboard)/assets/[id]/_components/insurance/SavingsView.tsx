'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { IncomeSheet } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { RecurringRuleSheet } from '@/app/(dashboard)/_components/RecurringRuleSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { AibutsuHeader, useTint } from '../AibutsuHeader'
import { AssetSwitcher, type SwitcherGroup } from '../AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow } from '../aibutsu-ui'
import { SavingsHero } from './SavingsHero'
import { MaturingSoonPrompt } from './MaturingSoonPrompt'
import { MaturedAwaitingPrompt } from './MaturedAwaitingPrompt'
import { computeSavingsProgress } from '@/lib/insuranceProgress'
import { incomeToFeedRow } from '@/lib/incomeFeedRow'
import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateAbsolute } from '@/lib/format-date'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { loadMoreInsuranceReturns } from '@/actions/income'
import { SAVINGS_RETURN_CATEGORIES } from '@/lib/incomeCategories'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import type { PagedTxnRow } from '@/actions/transaction'
import type { PagedIncomeRow } from '@/actions/income'
import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'
import type { TxnCursor } from '@/lib/db/queries/transactions'
import type { RecurringRuleRow } from '@/lib/db/queries/recurringIncome'

function lookupKindLabel(kind: string | null | undefined, td: Translations['assetDetail']['insurance']): string {
  if (!kind) return ''
  if (kind in td.kindLabels) return td.kindLabels[kind as keyof typeof td.kindLabels]
  return kind
}

function lookupPayCycleLabel(cycle: string | null | undefined, td: Translations['assetDetail']['insurance']): string {
  if (!cycle) return ''
  if (cycle in td.payCycleLabels) return td.payCycleLabels[cycle as keyof typeof td.payCycleLabels]
  return cycle
}

interface Props {
  assetId: string
  name: string
  notes: string | null
  details: InsuranceDetailsRow
  premiumStats: { total: number; count: number }
  returnStats: { total: number; count: number }
  /** v0.15.0 #132 — per-category totals across SAVINGS_RETURN_CATEGORIES.
   *  Drives the hero breakdown when >1 bucket is non-zero. Keys are
   *  IncomeCategoryId strings; absent categories default to 0. */
  returnBreakdown: Record<string, number>
  initialPremiumTxns: PagedTxnRow[]
  initialReturns: PagedIncomeRow[]
  pageSize: number
  assetSheetInitial: AssetSheetInitial
  linkedVehicle?: { id: string; name: string } | null
  /** #166 — recurring income rules already tied to this savings policy.
   *  Surfaced inline so users can see / create rules without leaving the page. */
  recurringRules: RecurringRuleRow[]
  allInsuranceGroups?: SwitcherGroup[]
}

const RETURN_CATEGORIES: string[] = [...SAVINGS_RETURN_CATEGORIES]

export function SavingsView({
  assetId,
  name,
  notes,
  details,
  premiumStats,
  returnStats,
  returnBreakdown,
  initialPremiumTxns,
  initialReturns,
  pageSize,
  assetSheetInitial,
  linkedVehicle,
  recurringRules,
  allInsuranceGroups,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
  const locale = useLocale()
  const td = t.assetDetail.insurance
  const ts = t.assetDetail.savings
  const { isPast } = useMember()
  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editAssetOpen, setEditAssetOpen] = useState(false)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const [incomePrefillAmount, setIncomePrefillAmount] = useState<number | undefined>(undefined)
  // #166 — null = closed; 'create' = new rule sheet; RecurringRuleRow = edit existing.
  const [recurringSheetState, setRecurringSheetState] = useState<null | 'create' | RecurringRuleRow>(null)
  const tint = useTint('insurance')

  useRealtimeEvents((event) => {
    if (event.kind === 'reconnect') { router.refresh(); return }
    if (event.kind === 'asset-changed' && event.row.id === assetId) {
      if (event.row.deletedAt) router.replace('/assets')
      else router.refresh()
      return
    }
    if ((event.kind === 'txn-insert' || event.kind === 'txn-update') && event.row.assetId === assetId) {
      router.refresh()
      return
    }
    if ((event.kind === 'income-insert' || event.kind === 'income-update') && event.row.assetId === assetId) {
      router.refresh()
      return
    }
    // #166 — recurring rule mutations (create / edit / pause / delete) on
    // either device should refresh the inline list. The realtime payload
    // doesn't include assetId, so we conservatively refresh on every change.
    if (event.kind === 'recurring-income-changed') {
      router.refresh()
    }
  })

  const progress = computeSavingsProgress({
    premiumTotal: premiumStats.total,
    returnTotal: returnStats.total,
    annualPremium: details.annualPremium,
    termYears: details.termYears,
    expectedMaturity: details.expectedMaturityAmount,
    startsAt: details.startsAt,
    endsAt: details.endsAt,
  })

  const subtitle = [details.insurer, lookupKindLabel(details.kind, td) || null].filter(Boolean).join(' · ') || null

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }

  const handleTxClick = (tx: PagedTxnRow) => {
    if (tx.kind !== 'transaction') return
    setEditingTx({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      splitType: tx.splitType!,
      splitRatioA: tx.splitRatioA ?? null,
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
      assetId,
    })
  }

  const openRecordReturn = (prefilledAmount?: number) => {
    setIncomePrefillAmount(prefilledAmount)
    setIncomeSheetOpen(true)
  }

  const initialReturnTxns = initialReturns.map(incomeToFeedRow)
  const returnLoader = async (cursor: TxnCursor | null): Promise<PagedTxnRow[]> => {
    const incomeCursor = cursor
      ? { occurredAt: cursor.transactedAt.substring(0, 10), createdAt: cursor.createdAt }
      : null
    const rows = await loadMoreInsuranceReturns(assetId, RETURN_CATEGORIES, incomeCursor, pageSize)
    return rows.map(incomeToFeedRow)
  }

  // Hide "記滿期金" CTA once user has clearly received the full expected amount.
  const showRecordReturnCta =
    details.expectedMaturityAmount === null ||
    progress.returnRatio === null ||
    progress.returnRatio < 1.05

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="insurance"
        name={
          allInsuranceGroups && allInsuranceGroups.length > 0 ? (
            <AssetSwitcher
              currentAssetId={assetId}
              groups={allInsuranceGroups}
              triggerBg="rgba(255,255,255,0.55)"
            >
              <span>{name}</span>
            </AssetSwitcher>
          ) : name
        }
        subtitle={subtitle}
        onEditClick={() => setEditAssetOpen(true)}
      />

      {/* Maturity write-CTAs (MaturedAwaitingPrompt / MaturingSoonPrompt) are
          unrendered in past-epoch mode: their onConfirm/onClick wires straight
          into openRecordReturn → IncomeSheet (a write surface). Mirrors the
          Task 7 pattern of full unrender rather than no-op handlers, and
          matches the FAB hide on `hideFab={isPast}` below. SavingsHero is
          read-only (its onSetExpectedMaturity opens AssetSheet, which mutates
          the asset itself — exempt from past-epoch guard, same as PetDetail /
          ChildDetail's onEditClick) so it stays rendered. */}
      {!isPast && progress.awaitingMaturity && details.expectedMaturityAmount !== null && details.endsAt ? (
        <MaturedAwaitingPrompt
          maturityDate={details.endsAt}
          expectedMaturity={details.expectedMaturityAmount}
          premiumTotal={premiumStats.total}
          premiumCount={premiumStats.count}
          onConfirm={() => openRecordReturn(details.expectedMaturityAmount ?? undefined)}
        />
      ) : (
        <>
          {!isPast && progress.isMaturingSoon && details.endsAt && (
            <MaturingSoonPrompt
              maturityDate={details.endsAt}
              onClick={() => openRecordReturn(details.expectedMaturityAmount ?? undefined)}
            />
          )}
          <SavingsHero
            progress={progress}
            startsAt={details.startsAt}
            endsAt={details.endsAt}
            returnBreakdown={returnBreakdown}
            onSetExpectedMaturity={() => setEditAssetOpen(true)}
          />
        </>
      )}

      {details.startsAt && details.endsAt && !progress.awaitingMaturity && (
        <div className="mx-4 mt-3 p-4 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="flex justify-between items-baseline">
            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>{td.contractProgress}</span>
            <span className="text-xs" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              {progress.yearsLeft !== null && progress.yearsLeft > 0
                ? td.yearsLeft.replace('{years}', progress.yearsLeft.toFixed(1))
                : progress.isMatured
                  ? td.matured
                  : ''}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(58,36,25,0.08)' }}>
            {/* .toFixed(2) — timeProgress is computed from `new Date()` inside */}
            {/* computeSavingsProgress at render time, so SSR and hydration get */}
            {/* slightly different float strings. Round the percent to stabilise. */}
            <div
              className="h-full rounded-full"
              style={{
                width: `${((progress.timeProgress ?? 0) * 100).toFixed(2)}%`,
                background: tint.accent,
              }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            <span>{details.startsAt}</span>
            <span>{details.endsAt}</span>
          </div>
        </div>
      )}

      <SectionHeader>{ts.sectionPremium}</SectionHeader>
      <div className="mx-4">
        <TransactionFeed
          initial={initialPremiumTxns}
          pageSize={pageSize}
          loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
          acceptInsert={(row) => row.assetId === assetId}
          onItemClick={handleTxClick}
          emptyState={
            <div className="text-center py-8 text-sm" style={{ color: 'var(--ink-3)' }}>
              {ts.paymentEmpty}
            </div>
          }
        />
      </div>

      <div className="px-5 pt-[18px] pb-2 flex items-center justify-between">
        <div className="text-xs tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
          {ts.sectionReturn}
        </div>
        {/* Inline addReturn (記滿期金) opens IncomeSheet — write surface,
            unrendered in past-epoch mode. */}
        {!isPast && showRecordReturnCta && (
          <button
            type="button"
            onClick={() => openRecordReturn()}
            className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            {ts.addReturn}
          </button>
        )}
      </div>
      <div className="mx-4">
        <TransactionFeed
          initial={initialReturnTxns}
          pageSize={pageSize}
          loader={returnLoader}
          acceptInsert={(row) => row.assetId === assetId}
          onItemClick={() => { /* edit-from-detail flow not implemented for income; user edits via Records page */ }}
          emptyState={
            <div className="text-center py-8 text-sm" style={{ color: 'var(--ink-3)' }}>
              {progress.isMatured
                ? ts.returnEmptyAwaiting
                : ts.returnEmptyBefore}
            </div>
          }
        />
      </div>

      {/* #166 — investment-linked savings policies: surface the current
          account value above the recurring section, plus an Update CTA that
          opens the AssetSheet so the user can refresh it from a statement. */}
      {details.accountValue !== null && (
        <>
          <SectionHeader>{ts.accountValueLabel}</SectionHeader>
          <div
            className="mx-4 rounded-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
          >
            <div className="px-4 py-3 flex items-baseline justify-between">
              <span
                className="text-xl font-medium tabular-nums"
                style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
              >
                {/* TODO(v0.17 currency): "NT$ {amount}" with space */}NT$ {details.accountValue.toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setEditAssetOpen(true)}
                className="text-xs font-medium underline-offset-2 underline bg-transparent border-0 cursor-pointer"
                style={{ color: 'var(--ink-2)' }}
              >
                {ts.accountValueEditCta}
              </button>
            </div>
          </div>
        </>
      )}

      {/* #166 — Recurring income tied to this policy. Dividends / survival
          annuities recur on a known cadence; setting a rule lets pg_cron
          surface a confirm card on the dashboard instead of users having to
          remember to log them manually. */}
      <RecurringRulesSection
        rules={recurringRules}
        onAdd={() => setRecurringSheetState('create')}
        onEdit={(rule) => setRecurringSheetState(rule)}
        translations={ts}
        locale={locale}
        intervalLabels={{
          1: t.recurringIncome.rule.intervalEveryMonth,
          3: t.recurringIncome.rule.intervalEveryQuarter,
          6: t.recurringIncome.rule.intervalEveryHalfYear,
          12: t.recurringIncome.rule.intervalEveryYear,
          fallback: t.recurringIncome.rule.intervalEveryNMonths,
        }}
      />

      <SectionHeader>{td.sectionContract}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.kind} value={lookupKindLabel(details.kind, td) + (details.termYears ? td.termYearsParen.replace('{n}', String(details.termYears)) : '')} />
        {/* #167 + #237 — display precedence: Child 愛物 > group member > freeform. */}
        <InfoRow label={td.insured} value={details.insuredChildName ?? details.insuredUserDisplayName ?? details.insured ?? ''} />
        <InfoRow label={td.insurer} value={details.insurer ?? ''} />
        <InfoRow label={td.policyNo} value={details.policyNo ?? ''} mono />
        <InfoRow label={td.payCycle} value={lookupPayCycleLabel(details.payCycle, td)} />
        {/* TODO(v0.17 currency): "NT$ {amount}" with space — defer to design before migrating to formatAmount. */}
        <InfoRow
          label={td.expectedMaturity}
          value={details.expectedMaturityAmount !== null ? `NT$ ${details.expectedMaturityAmount.toLocaleString()}` : ''}
          mono
          last
        />
      </InfoCard>

      <SectionHeader>{td.sectionMaturity}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.startsAt} value={details.startsAt ?? ''} mono />
        <InfoRow label={td.endsAt} value={details.endsAt ?? ''} mono last />
      </InfoCard>

      {linkedVehicle && (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
          <div className="px-5 py-4">
            <div className="text-xs font-medium tracking-[0.5px] mb-2" style={{ color: 'var(--ink-3)' }}>
              {t.assetDetail.linkedVehicleSection}
            </div>
            <Link
              href={`/assets/${linkedVehicle.id}`}
              className="flex items-center gap-3 text-sm font-medium"
              style={{ color: 'var(--ink)' }}
            >
              <span>🚗</span>
              <span>{linkedVehicle.name}</span>
              <span style={{ color: 'var(--ink-3)', marginLeft: 'auto' }}>›</span>
            </Link>
          </div>
        </div>
      )}

      {notes && (
        <>
          <SectionHeader>{t.assetDetail.notesSection}</SectionHeader>
          <InfoCard>
            <div className="px-4 py-3 whitespace-pre-wrap text-sm" style={{ color: 'var(--ink)' }}>
              {notes}
            </div>
          </InfoCard>
        </>
      )}

      {/* Asset CRUD (onEditClick) is exempt from past-epoch guard, but FAB
          (which opens AddSheet → cash-transaction write) hides in past mode. */}
      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" hideFab={isPast} />

      <AddSheet
        open={addOpen || editingTx !== null}
        onClose={() => { setAddOpen(false); setEditingTx(null) }}
        initial={editingTx ?? undefined}
        prefilledAssetId={addOpen ? assetId : undefined}
        onMutated={() => router.refresh()}
      />

      <IncomeSheet
        open={incomeSheetOpen}
        onClose={() => { setIncomeSheetOpen(false); setIncomePrefillAmount(undefined) }}
        prefilledAssetId={assetId}
        prefilledCategory="maturity"
        prefilledAmount={incomePrefillAmount}
        onMutated={() => router.refresh()}
      />

      <AssetSheet
        open={editAssetOpen}
        onClose={() => setEditAssetOpen(false)}
        initial={assetSheetInitial}
        onMutated={handleAssetMutated}
      />

      {/* #166 — RecurringRuleSheet (income variant) reused for savings-policy
          recurrences. We pass this single asset in insuranceAssets so the
          asset link stays prefilled; prefill seeds category=dividend so
          users land on the most common case (still editable). */}
      <RecurringRuleSheet
        type="income"
        open={recurringSheetState !== null}
        onClose={() => setRecurringSheetState(null)}
        onMutated={() => { setRecurringSheetState(null); router.refresh() }}
        initial={typeof recurringSheetState === 'object' && recurringSheetState !== null ? recurringSheetState : undefined}
        insuranceAssets={[{ id: assetId, name }]}
        prefill={recurringSheetState === 'create' ? { assetId, category: 'dividend', source: name } : undefined}
      />
    </div>
  )
}

/**
 * #166 — Renders existing recurring rules for this savings asset and a CTA
 * to add a new one. Kept inline (single call-site) until another page needs it.
 */
function RecurringRulesSection({
  rules,
  onAdd,
  onEdit,
  translations,
  intervalLabels,
  locale,
}: {
  rules: RecurringRuleRow[]
  onAdd: () => void
  onEdit: (rule: RecurringRuleRow) => void
  translations: Translations['assetDetail']['savings']
  intervalLabels: { 1: string; 3: string; 6: string; 12: string; fallback: string }
  locale: string
}) {
  const P = DEFAULT_INCOME_PALETTE
  return (
    <>
      <div className="px-5 pt-[18px] pb-2 flex items-center justify-between">
        <div className="text-xs tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
          {translations.recurringSectionTitle}
        </div>
        {rules.length > 0 && (
          <button
            type="button"
            onClick={onAdd}
            className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium bg-transparent border-0 cursor-pointer"
            style={{ color: P.ink }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {translations.recurringAddCta}
          </button>
        )}
      </div>
      <div className="mx-4">
        {rules.length === 0 ? (
          <div
            className="rounded-2xl px-4 py-5 flex flex-col items-center text-center"
            style={{ background: P.tint, border: `1px solid ${P.ink}20` }}
          >
            <p className="text-sm mb-3" style={{ color: P.ink, lineHeight: 1.5 }}>
              {translations.recurringEmptyHint}
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="h-9 px-4 rounded-full text-sm font-medium border-0 cursor-pointer"
              style={{ background: P.ink, color: 'var(--on-fill)' }}
            >
              {translations.recurringAddCta}
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li key={rule.id}>
                <button
                  type="button"
                  onClick={() => onEdit(rule)}
                  className="w-full text-left rounded-2xl px-4 py-3 bg-surface cursor-pointer"
                  style={{ border: '1px solid var(--hairline)' }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-medium tabular-nums" style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}>
                      {/* TODO(v0.17 currency): "NT$ {amount}" with space */}
                      NT$ {rule.amount.toLocaleString()}
                    </span>
                    {rule.pausedAt ? (
                      <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{translations.recurringRulePaused}</span>
                    ) : (
                      <span className="text-xs tabular-nums" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
                        {translations.recurringRuleNextDate.replace('{date}', formatDateAbsolute(rule.nextOccurrenceAt, locale))}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
                    {translations.recurringRuleSummary
                      .replace('{day}', String(rule.dayOfMonth))
                      .replace('{interval}', formatInterval(rule.intervalMonths, intervalLabels))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function formatInterval(
  months: number,
  labels: { 1: string; 3: string; 6: string; 12: string; fallback: string },
): string {
  if (months === 1) return labels[1]
  if (months === 3) return labels[3]
  if (months === 6) return labels[6]
  if (months === 12) return labels[12]
  return labels.fallback.replace('{n}', String(months))
}
