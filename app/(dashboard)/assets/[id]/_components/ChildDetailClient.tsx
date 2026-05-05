'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { AssetSwitcher } from './AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol, AgeDisplay } from './aibutsu-ui'
import type { ChildDetailsRow } from '@/lib/db/queries/aibutsu'
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
  details: ChildDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

export function ChildDetailClient({ assetId, name, details, summary, assetSheetInitial, initialTxns, pageSize, allAssets }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('child')
  const subtitle = details
    ? [
        details.gender === 'male' ? '男' : details.gender === 'female' ? '女' : null,
        details.bloodType ? `${details.bloodType} 型` : null
      ].filter(Boolean).join(' · ')
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
        kind="child"
        name={name}
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
        switcher={<AssetSwitcher currentAssetId={assetId} allAssets={allAssets} />}
      />

      {details?.birthday && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <AgeDisplay birth={details.birthday} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>身分證件</SectionHeader>
      <InfoCard>
        <InfoRow label="身分證號" value={details?.nationalId ?? ''} mono />
        <InfoRow label="健保卡號" value={details?.nhiNo ?? ''} mono />
        <InfoRow label="出生醫院" value={details?.hospital ?? ''} />
        <InfoRow label="血型" value={details?.bloodType ? `${details.bloodType} 型` : ''} last />
      </InfoCard>

      <SectionHeader>身體紀錄</SectionHeader>
      <InfoCard>
        <InfoRow label="身高" value={details?.heightCm ? `${details.heightCm} cm` : ''} mono />
        <InfoRow label="體重" value={details?.weightG ? `${(details.weightG / 1000).toFixed(1)} kg` : ''} mono last />
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
