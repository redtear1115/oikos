'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { IncomeSheet } from '@/app/(dashboard)/dashboard/_components/IncomeSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { useRealtimeEvents } from '@/app/(dashboard)/_components/RealtimeProvider'
import { AibutsuHeader, useTint } from '../AibutsuHeader'
import { AssetSwitcher } from '../AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow } from '../aibutsu-ui'
import { SavingsHero } from './SavingsHero'
import { MaturingSoonPrompt } from './MaturingSoonPrompt'
import { MaturedAwaitingPrompt } from './MaturedAwaitingPrompt'
import { computeSavingsProgress } from '@/lib/insuranceProgress'
import { incomeToFeedRow } from '@/lib/incomeFeedRow'
import { useTranslations } from '@/lib/i18n/client'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { loadMoreInsuranceReturns } from '@/actions/income'
import type { PagedTxnRow } from '@/actions/transaction'
import type { PagedIncomeRow } from '@/actions/income'
import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'
import type { TxnCursor } from '@/lib/db/queries/transactions'

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

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
  initialPremiumTxns: PagedTxnRow[]
  initialReturns: PagedIncomeRow[]
  pageSize: number
  assetSheetInitial: AssetSheetInitial
  allAssets: Array<{ id: string; name: string; type: AssetType }>
  linkedVehicle?: { id: string; name: string } | null
}

const RETURN_CATEGORIES = ['maturity']

export function SavingsView({
  assetId,
  name,
  notes,
  details,
  premiumStats,
  returnStats,
  initialPremiumTxns,
  initialReturns,
  pageSize,
  assetSheetInitial,
  allAssets,
  linkedVehicle,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
  const td = t.assetDetail.insurance
  const ts = t.assetDetail.savings
  const [addOpen, setAddOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const [editAssetOpen, setEditAssetOpen] = useState(false)
  const [incomeSheetOpen, setIncomeSheetOpen] = useState(false)
  const [incomePrefillAmount, setIncomePrefillAmount] = useState<number | undefined>(undefined)
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
          <AssetSwitcher currentAssetId={assetId} allAssets={allAssets}>
            <span>{name}</span>
          </AssetSwitcher>
        }
        subtitle={subtitle}
        onEditClick={() => setEditAssetOpen(true)}
      />

      {progress.awaitingMaturity && details.expectedMaturityAmount !== null && details.endsAt ? (
        <MaturedAwaitingPrompt
          maturityDate={details.endsAt}
          expectedMaturity={details.expectedMaturityAmount}
          premiumTotal={premiumStats.total}
          premiumCount={premiumStats.count}
          onConfirm={() => openRecordReturn(details.expectedMaturityAmount ?? undefined)}
        />
      ) : (
        <>
          {progress.isMaturingSoon && details.endsAt && (
            <MaturingSoonPrompt
              maturityDate={details.endsAt}
              onClick={() => openRecordReturn(details.expectedMaturityAmount ?? undefined)}
            />
          )}
          <SavingsHero
            progress={progress}
            startsAt={details.startsAt}
            endsAt={details.endsAt}
            onSetExpectedMaturity={() => setEditAssetOpen(true)}
          />
        </>
      )}

      {details.startsAt && details.endsAt && !progress.awaitingMaturity && (
        <div className="mx-4 mt-3 p-4 rounded-2xl" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
          <div className="flex justify-between items-baseline">
            <span className="text-micro" style={{ color: 'var(--ink-2)' }}>{td.contractProgress}</span>
            <span className="text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
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
          <div className="mt-1.5 flex justify-between text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
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
        <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
          {ts.sectionReturn}
        </div>
        {showRecordReturnCta && (
          <button
            type="button"
            onClick={() => openRecordReturn()}
            className="h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-micro font-medium"
            style={{ background: '#fff', border: '1px solid var(--hairline)', color: 'var(--ink-2)' }}
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

      <SectionHeader>{td.sectionContract}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.kind} value={lookupKindLabel(details.kind, td) + (details.termYears ? td.termYearsParen.replace('{n}', String(details.termYears)) : '')} />
        <InfoRow label={td.insured} value={details.insured ?? ''} />
        <InfoRow label={td.insurer} value={details.insurer ?? ''} />
        <InfoRow label={td.policyNo} value={details.policyNo ?? ''} mono />
        <InfoRow label={td.payCycle} value={lookupPayCycleLabel(details.payCycle, td)} />
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
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
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

      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" />

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
    </div>
  )
}
