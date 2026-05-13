'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol, AgeDisplay } from './aibutsu-ui'
import type { PetDetailsRow } from '@/lib/db/queries/aibutsu'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { AibutsuHintCard } from './AibutsuHintCard'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

interface Props {
  assetId: string
  name: string
  notes: string | null
  details: PetDetailsRow | null
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
}

export function PetDetailClient({ assetId, name, notes, details, summary, assetSheetInitial, initialTxns, pageSize }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const td = t.assetDetail.pet
  const { isPast } = useMember()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('pet')
  // Species enum (cat/dog/…/other) is set by AssetSheet's chip picker — reuse
  // the same i18n strings rather than duplicating under assetDetail.pet.
  const ps = t.assetSheet.pet
  const speciesLabel = details?.species === 'cat' ? ps.speciesCat
    : details?.species === 'dog' ? ps.speciesDog
    : details?.species === 'rabbit' ? ps.speciesRabbit
    : details?.species === 'bird' ? ps.speciesBird
    : details?.species === 'fish' ? ps.speciesFish
    : details?.species === 'other' ? ps.speciesOther
    : null
  const subtitle = details
    ? [speciesLabel, details.breed,
        details.sex === 'female' ? td.sexFemale
          : details.sex === 'male' ? td.sexMale
          : details.sex === 'unknown' ? td.sexUnknown
          : null
      ].filter(Boolean).join(' · ')
    : null

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }

  const handleTxClick = (tx: PagedTxnRow) => {
    // Past-epoch view is read-only — never open an edit sheet.
    if (isPast) return
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
      notes: tx.notes,
    })
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="pet"
        name={name}
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
      />

      {details?.birthDate && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <AgeDisplay birth={details.birthDate} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>{td.sectionAtHome}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.birthDate} value={details?.birthDate ?? ''} mono />
        <InfoRow label={td.adoptedDate} value={details?.adoptedDate ?? ''} mono />
        <InfoRow label={td.purchaseCost} value={details?.purchaseCost ? `NT$ ${details.purchaseCost.toLocaleString()}` : ''} mono />
        <InfoRow label={td.weight} value={details?.weightG ? `${(details.weightG / 1000).toFixed(1)} kg` : ''} mono last />
      </InfoCard>

      <SectionHeader>{td.sectionHealth}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.chipNo} value={details?.chipNo ?? ''} mono />
        <InfoRow label={td.vet} value={details?.vet ?? ''} last />
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
        emptyState={<AibutsuHintCard type="pet" onCtaPress={() => setAddOpen(true)} />}
        header={(count) => (
          <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            {t.assetDetail.timelineEntries.replace('{count}', String(count))}
          </div>
        )}
      />

      {/* Asset CRUD (onEditClick) is exempt from past-epoch guard, but FAB
          opens an AddSheet that creates a new transaction — hide it. */}
      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" hideFab={isPast} />
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
