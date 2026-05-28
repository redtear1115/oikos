'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, type SiblingChip } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol } from './aibutsu-ui'
import { AibutsuHintCard } from './AibutsuHintCard'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import { getTemplate, type AssetTemplateKey } from '@/lib/assetTemplates'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

interface Props {
  assetId: string
  name: string
  notes: string | null
  templateKey: AssetTemplateKey
  templateFields: Record<string, string | number | null>
  summary: AssetSummary
  assetSheetInitial: AssetSheetInitial
  initialTxns: PagedTxnRow[]
  pageSize: number
  siblings?: SiblingChip[]
}

// #222 — detail page for template-based assets. Renders the template's
// declared field set as a read-only InfoCard (with `—` for empty values),
// then the standard money summary + transaction feed. The asset's own
// template can be edited via the header ⋯; AssetSheet routes back into
// TemplateSheetBody because the asset's type is 'item'.
//
// v1 (only `general` template, no declared fields): the InfoCard section is
// skipped entirely — page degrades to a name + notes + transaction feed.
export function TemplateAssetDetailClient({
  assetId,
  name,
  notes,
  templateKey,
  templateFields,
  summary,
  assetSheetInitial,
  initialTxns,
  pageSize,
  siblings,
}: Props) {
  const router = useRouter()
  const t = useTranslations()
  const ts = t.assetTemplate
  const { isPast } = useMember()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)

  const accent = '#6E5F52'
  const template = getTemplate(templateKey)

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }

  const handleTxClick = (tx: PagedTxnRow) => {
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

  // Subtitle = the type label ('物品'). For v1 with only one template, no
  // per-template label is needed — TypePicker / assetSheet.type.item already
  // covers the wording.
  const subtitle = t.assetSheet.type.item

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="item"
        name={name}
        subtitle={subtitle}
        onEditClick={() => setEditOpen(true)}
        siblings={siblings}
        currentAssetId={assetId}
      />

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={accent} />

      {template.fields.length > 0 && (
        <>
          <SectionHeader>{ts.detailSection}</SectionHeader>
          <InfoCard>
            {template.fields.map((field, i) => {
              const raw = templateFields?.[field.name]
              // TODO(v0.17 currency): generic "number" template field — may or
              // may not be currency. Decide per-template before routing through
              // formatAmount (which always adds a symbol).
              const value = raw == null ? '' :
                field.type === 'number' ? Number(raw).toLocaleString('en-US')
                : String(raw)
              return (
                <InfoRow
                  key={field.name}
                  label={field.name}
                  value={value}
                  mono={field.type === 'number' || field.type === 'date'}
                  last={i === template.fields.length - 1}
                />
              )
            })}
          </InfoCard>
        </>
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

      <SectionHeader>{t.assetDetail.recentExpenses}</SectionHeader>
      <TransactionFeed
        initial={initialTxns}
        pageSize={pageSize}
        loader={(cursor) => loadMoreTransactionsForAsset(assetId, cursor, pageSize)}
        acceptInsert={(row) => row.assetId === assetId}
        onItemClick={handleTxClick}
        emptyState={<AibutsuHintCard type="item" onCtaPress={() => setAddOpen(true)} />}
        header={(count) => (
          <div className="text-micro tracking-[1.5px] uppercase" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            {t.assetDetail.timelineEntries.replace('{count}', String(count))}
          </div>
        )}
      />

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
