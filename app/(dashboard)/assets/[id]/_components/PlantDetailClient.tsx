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

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

interface Props {
  assetId: string
  name: string
  details: PlantDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

function CompanionDays({ sproutedAt, waterEvery, accent }: { sproutedAt: string; waterEvery: number | null; accent: string }) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(sproutedAt).getTime()) / 86400000))
  return (
    <div className="text-center py-2">
      <div className="text-[10px] tracking-[1.5px] uppercase" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>陪伴天數</div>
      <div className="inline-flex items-baseline gap-1.5 mt-1.5">
        <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 56, fontWeight: 600, color: 'var(--ink)', letterSpacing: -2 }}>{days}</span>
        <span className="text-sm font-medium" style={{ color: accent }}>天</span>
      </div>
      <div className="text-[10px] mt-1.5 opacity-75" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>
        {sproutedAt} 入手{waterEvery ? ` · 每 ${waterEvery} 天澆水` : ''}
      </div>
    </div>
  )
}

export function PlantDetailClient({ assetId, name, details, summary, assetSheetInitial, initialTxns, pageSize, allAssets }: Props) {
  const router = useRouter()
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
    })
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="plant"
        name={name}
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
        switcher={<AssetSwitcher currentAssetId={assetId} allAssets={allAssets} />}
      />

      {details?.sproutedAt && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <CompanionDays sproutedAt={details.sproutedAt} waterEvery={details.waterEvery} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>植物紀錄</SectionHeader>
      <InfoCard>
        <InfoRow label="入手日" value={details?.sproutedAt ?? ''} mono />
        <InfoRow label="入手金額" value={details?.cost ? `NT$ ${details.cost.toLocaleString()}` : ''} mono />
        <InfoRow label="位置" value={details?.location ?? ''} />
        <InfoRow label="澆水週期" value={details?.waterEvery ? `每 ${details.waterEvery} 天` : ''} mono last />
      </InfoCard>

      <SectionHeader>近期花費</SectionHeader>
      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        onItemClick={handleTxClick}
        emptyState={<div className="text-center py-10 px-6 text-sm" style={{ color: 'var(--ink-3)' }}>還沒有任何花費</div>}
        header={(count) => (
          <div className="text-[11px] tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            時間軸 · {count} 筆
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
