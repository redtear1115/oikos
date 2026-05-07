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
import type { HouseDetailsRow } from '@/lib/db/queries/aibutsu'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { AibutsuHintCard } from './AibutsuHintCard'

function HomeStat({ purchasedAt, accent }: { purchasedAt: string; accent: string }) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(purchasedAt).getTime()) / 86400000))
  return (
    <div className="text-center py-2">
      <div className="text-micro tracking-[1.5px] uppercase" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>入住天數</div>
      <div className="inline-flex items-baseline gap-1.5 mt-1.5">
        <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-lg)', fontWeight: 600, color: 'var(--ink)', letterSpacing: -2 }}>{days}</span>
        <span className="text-sm font-medium" style={{ color: accent }}>天</span>
      </div>
      <div className="text-micro mt-1.5 opacity-75" style={{ color: accent, fontFamily: 'var(--font-numeric)' }}>
        {purchasedAt} 入住
      </div>
    </div>
  )
}

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

interface Props {
  assetId: string
  name: string
  details: HouseDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

export function HouseDetailClient({ assetId, name, details, summary, assetSheetInitial, initialTxns, pageSize, allAssets }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('house')

  const subtitle = details?.address ?? null

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
        kind="house"
        name={
          <AssetSwitcher currentAssetId={assetId} allAssets={allAssets}>
            <span>{name}</span>
          </AssetSwitcher>
        }
        subtitle={subtitle}
        onEditClick={() => setEditOpen(true)}
      />

      {details?.purchasedAt && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <HomeStat purchasedAt={details.purchasedAt} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>房子資訊</SectionHeader>
      <InfoCard>
        <InfoRow label="地址" value={details?.address ?? ''} />
        <InfoRow label="購入日" value={details?.purchasedAt ?? ''} mono />
        <InfoRow label="購入金額" value={details?.purchasePrice ? `NT$ ${details.purchasePrice.toLocaleString()}` : ''} mono last />
      </InfoCard>

      <SectionHeader>近期花費</SectionHeader>
      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        onItemClick={handleTxClick}
        emptyState={<AibutsuHintCard type="house" onCtaPress={() => setAddOpen(true)} />}
        header={(count) => (
          <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
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
