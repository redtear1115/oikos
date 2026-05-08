'use client'

import { useState, useTransition } from 'react'
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
import { revealChildPii } from '@/actions/asset'
import { AibutsuHintCard } from './AibutsuHintCard'
import { resolveDisplayName } from '@/lib/display-name'

// 10 mask characters — enough to read as "filled in" without leaking length.
const PII_MASK = '●●●●●●●●●●'

/**
 * A row showing an encrypted PII value. Default state is masked; tapping
 * 「顯示」 calls revealChildPii() server action and stores the plaintext in
 * local state until the user toggles it back. If `hasValue` is false we just
 * render the empty InfoRow (no toggle).
 */
function RevealableRow({
  label,
  hasValue,
  assetId,
  field,
  last,
}: {
  label: string
  hasValue: boolean
  assetId: string
  field: 'nationalId' | 'nhiNo'
  last?: boolean
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!hasValue) {
    return <InfoRow label={label} value="" mono last={last} />
  }

  const onToggle = () => {
    if (revealed !== null) {
      setRevealed(null)
      setError(null)
      return
    }
    startTransition(async () => {
      try {
        const value = await revealChildPii(assetId, field)
        setRevealed(value)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : '無法顯示')
      }
    })
  }

  const displayValue = revealed ?? PII_MASK
  return (
    <div
      className="px-[14px] py-[11px] flex items-center gap-2.5"
      style={{ borderBottom: last ? 'none' : '1px solid var(--hairline)' }}
    >
      <div
        className="text-micro shrink-0 tracking-[0.4px]"
        style={{ color: 'var(--ink-3)', width: 76 }}
      >{label}</div>
      <div
        className="flex-1 text-label font-medium truncate"
        style={{ color: 'var(--ink)', fontFamily: 'var(--font-numeric)' }}
      >
        {error ?? displayValue}
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        className="text-xs px-2 py-1 rounded-md cursor-pointer border-0 disabled:cursor-default"
        style={{ background: 'var(--surface)', color: 'var(--ink-2)' }}
      >
        {pending ? '…' : (revealed !== null ? '隱藏' : '顯示')}
      </button>
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
  nickname: string | null
  notes: string | null
  details: ChildDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

export function ChildDetailClient({ assetId, name, nickname, notes, details, summary, assetSheetInitial, initialTxns, pageSize, allAssets }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('child')
  const display = resolveDisplayName(name, nickname)
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
        name={
          <AssetSwitcher currentAssetId={assetId} allAssets={allAssets}>
            <span className="inline-flex items-baseline gap-2 min-w-0">
              <span className="truncate">{display.primary}</span>
              {display.secondary && (
                <span
                  className="text-micro tracking-[0.5px] truncate"
                  style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}
                >
                  {display.secondary}
                </span>
              )}
            </span>
          </AssetSwitcher>
        }
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
      />

      {details?.birthday && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <AgeDisplay birth={details.birthday} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>身分證件</SectionHeader>
      <InfoCard>
        <InfoRow label="出生日" value={details?.birthday ?? ''} mono />
        <RevealableRow
          label="身分證號"
          hasValue={details?.hasNationalId ?? false}
          assetId={assetId}
          field="nationalId"
        />
        <RevealableRow
          label="健保卡號"
          hasValue={details?.hasNhiNo ?? false}
          assetId={assetId}
          field="nhiNo"
        />
        <InfoRow label="出生醫院" value={details?.hospital ?? ''} />
        <InfoRow label="血型" value={details?.bloodType ? `${details.bloodType} 型` : ''} last />
      </InfoCard>

      <SectionHeader>身體紀錄</SectionHeader>
      <InfoCard>
        <InfoRow label="身高" value={details?.heightCm ? `${details.heightCm} cm` : ''} mono />
        <InfoRow label="體重" value={details?.weightG ? `${(details.weightG / 1000).toFixed(1)} kg` : ''} mono last />
      </InfoCard>

      {notes && (
        <>
          <SectionHeader>備註</SectionHeader>
          <InfoCard>
            <div className="px-4 py-3 whitespace-pre-wrap text-sm" style={{ color: 'var(--ink)' }}>
              {notes}
            </div>
          </InfoCard>
        </>
      )}

      <SectionHeader>近期花費</SectionHeader>
      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        onItemClick={handleTxClick}
        emptyState={<AibutsuHintCard type="child" onCtaPress={() => setAddOpen(true)} />}
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
