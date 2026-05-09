'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { AssetSwitcher } from './AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol } from './aibutsu-ui'
import type { PlantDetailsRow } from '@/lib/db/queries/aibutsu'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { AibutsuHintCard } from './AibutsuHintCard'
import { useTranslations } from '@/lib/i18n/client'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

interface Props {
  assetId: string
  name: string
  notes: string | null
  details: PlantDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

function CompanionDays({ sproutedAt, waterEvery, accent, td }: { sproutedAt: string; waterEvery: number | null; accent: string; td: Translations['assetDetail']['plant'] }) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(sproutedAt).getTime()) / 86400000))
  return (
    <div className="text-center py-2">
      <div className="text-micro tracking-[1.5px] uppercase" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>{td.companionDays}</div>
      <div className="inline-flex items-baseline gap-1.5 mt-1.5">
        <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-lg)', fontWeight: 600, color: 'var(--ink)', letterSpacing: -2 }}>{days}</span>
        <span className="text-sm font-medium" style={{ color: accent }}>{td.daysSuffix}</span>
      </div>
      <div className="text-micro mt-1.5 opacity-75" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>
        {sproutedAt}{td.sproutedSuffix}{waterEvery ? td.waterEveryFooter.replace('{n}', String(waterEvery)) : ''}
      </div>
    </div>
  )
}

export function PlantDetailClient({ assetId, name, notes, details, summary, assetSheetInitial, initialTxns, pageSize, allAssets }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const td = t.assetDetail.plant
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('plant')
  const subtitle = details
    ? [details.species, details.location].filter(Boolean).join(' · ')
    : null

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
      payerId: tx.paidBy,
      transactedAt: tx.transactedAt,
      assetId,
      notes: tx.notes,
    })
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="plant"
        name={
          <AssetSwitcher currentAssetId={assetId} allAssets={allAssets}>
            <span>{name}</span>
          </AssetSwitcher>
        }
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
      />

      {details?.sproutedAt && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <CompanionDays sproutedAt={details.sproutedAt} waterEvery={details.waterEvery} accent={tint.accent} td={td} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>{td.sectionRecord}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.sproutedAt} value={details?.sproutedAt ?? ''} mono />
        <InfoRow label={td.cost} value={details?.cost ? `NT$ ${details.cost.toLocaleString()}` : ''} mono />
        <InfoRow label={td.location} value={details?.location ?? ''} />
        <InfoRow label={td.waterEvery} value={details?.waterEvery ? td.waterEveryValue.replace('{n}', String(details.waterEvery)) : ''} mono last />
      </InfoCard>

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

      <SectionHeader>{t.assetDetail.recentExpenses}</SectionHeader>
      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        onItemClick={handleTxClick}
        emptyState={<AibutsuHintCard type="plant" onCtaPress={() => setAddOpen(true)} />}
        header={(count) => (
          <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            {t.assetDetail.timelineEntries.replace('{count}', String(count))}
          </div>
        )}
      />

      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" />
      <AddSheet
        open={addOpen || editingTx !== null}
        onClose={() => { setAddOpen(false); setEditingTx(null) }}
        initial={editingTx ?? undefined}
        prefilledAssetId={addOpen ? assetId : undefined}
        onMutated={() => router.refresh()}
      />

      <AssetSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={assetSheetInitial}
        onMutated={handleAssetMutated}
      />
    </div>
  )
}
