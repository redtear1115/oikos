'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { TransactionFeed } from '@/app/(dashboard)/_components/TransactionFeed'
import { AddSheet, type AddSheetInitial } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint, type SiblingChip } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol, AgeDisplay } from './aibutsu-ui'
import type { ChildDetailsRow } from '@/lib/db/queries/aibutsu'
import type { PagedTxnRow } from '@/actions/transaction'
import { loadMoreTransactionsForAsset } from '@/actions/transaction'
import { revealChildPii, revealChildName } from '@/actions/asset'
import { RevealableRow as SharedRevealableRow } from '@/app/(dashboard)/_components/RevealableRow'
import { AibutsuHintCard } from './AibutsuHintCard'
import { resolveDisplayName } from '@/lib/display-name'
import { useTranslations } from '@/lib/i18n/client'
import { describeError } from '@/lib/errors'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'

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
  const t = useTranslations()
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
        setError(describeError(e, t.assetDetail.child.revealError, t.common.offlineError))
      }
    })
  }

  const displayValue = revealed ?? PII_MASK
  return (
    <div
      className="px-3.5 py-[11px] flex items-center gap-2.5"
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
        {pending ? t.assetDetail.child.revealLoading : (revealed !== null ? t.assetDetail.child.revealHide : t.assetDetail.child.revealShow)}
      </button>
    </div>
  )
}

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

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
  siblings?: SiblingChip[]
}

export function ChildDetailClient({ assetId, name, nickname, notes, details, summary, assetSheetInitial, initialTxns, pageSize, siblings }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const td = t.assetDetail.child
  const { isPast } = useMember()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<AddSheetInitial | null>(null)
  const tint = useTint('child')
  const display = resolveDisplayName(name, nickname)
  const subtitle = details
    ? [
        details.gender === 'male' ? td.genderMale : details.gender === 'female' ? td.genderFemale : null,
        details.bloodType ? td.bloodTypeValue.replace('{type}', details.bloodType) : null
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
        kind="child"
        name={display.primary}
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
        siblings={siblings}
        currentAssetId={assetId}
      />

      {details?.birthday && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <AgeDisplay birth={details.birthday} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>{td.sectionId}</SectionHeader>
      <InfoCard>
        {/* #826 — full real name row. Header above shows the nickname
            (Assets.name). This row decrypts the legal full name on tap.
            Uses the shared RevealableRow because the binding is a generic
            callback; the older inline RevealableRow stays for nationalId
            and nhiNo until those are migrated in cleanup. */}
        <SharedRevealableRow
          label={td.fullName}
          hasValue={assetSheetInitial.childHasFullName ?? false}
          revealAction={() => revealChildName(assetId)}
        />
        <InfoRow label={td.bornDate} value={details?.birthday ?? ''} mono />
        <RevealableRow
          label={td.nationalId}
          hasValue={details?.hasNationalId ?? false}
          assetId={assetId}
          field="nationalId"
        />
        <RevealableRow
          label={td.nhiNo}
          hasValue={details?.hasNhiNo ?? false}
          assetId={assetId}
          field="nhiNo"
        />
        <InfoRow label={td.bornHospital} value={details?.hospital ?? ''} />
        <InfoRow label={td.bloodType} value={details?.bloodType ? td.bloodTypeValue.replace('{type}', details.bloodType) : ''} last />
      </InfoCard>

      <SectionHeader>{td.sectionBody}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.height} value={details?.heightCm ? `${details.heightCm} cm` : ''} mono />
        <InfoRow label={td.weight} value={details?.weightG ? `${(details.weightG / 1000).toFixed(1)} kg` : ''} mono last />
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
        emptyState={<AibutsuHintCard type="child" onCtaPress={() => setAddOpen(true)} />}
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
