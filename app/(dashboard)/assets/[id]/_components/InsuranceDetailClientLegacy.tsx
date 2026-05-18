'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { AssetSwitcher, type SwitcherGroup } from './AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow } from './aibutsu-ui'
import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'
import { useTranslations } from '@/lib/i18n/client'
import { useMember } from '@/app/(dashboard)/_components/MemberContext'
import type { Translations } from '@/lib/i18n/locales/zh-TW'

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
  details: InsuranceDetailsRow | null
  linkedVehicle?: { id: string; name: string } | null
  assetSheetInitial: AssetSheetInitial
  allInsuranceGroups?: SwitcherGroup[]
}

export function InsuranceDetailClientLegacy({ assetId, name, notes, details, linkedVehicle, assetSheetInitial, allInsuranceGroups }: Props) {
  const router = useRouter()
  const t = useTranslations()
  const td = t.assetDetail.insurance
  const { isPast } = useMember()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const tint = useTint('insurance')

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }
  const subtitle = details
    ? [details.insurer, details.kind ? lookupKindLabel(details.kind, td) : null].filter(Boolean).join(' · ')
    : null

  let pct = 0
  let yearsLeft = 0
  let daysLeft: number | null = null
  if (details?.startsAt && details?.endsAt) {
    const start = new Date(details.startsAt)
    const end = new Date(details.endsAt)
    const now = new Date()
    pct = Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())))
    yearsLeft = Math.max(0, (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    if (yearsLeft < 1) daysLeft = Math.max(0, Math.round(yearsLeft * 365.25))
  }
  const hasDates = !!(details?.startsAt && details?.endsAt)

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
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
      />

      <div className="px-5 pb-6 text-center" style={{ background: tint.bg }}>
        {hasDates ? (
          <>
            <div className="text-micro tracking-[1.5px] uppercase mt-1" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>
              {pct >= 1 ? td.expired : td.coverageRemaining}
            </div>
            <div className="inline-flex items-baseline gap-1.5 mt-1.5">
              <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-lg)', fontWeight: 600, color: pct >= 1 ? 'var(--ink-3)' : 'var(--ink)', letterSpacing: -1.5 }}>
                {pct >= 1 ? '0' : daysLeft !== null ? daysLeft.toString() : yearsLeft.toFixed(1)}
              </span>
              {pct < 1 && (
                <span className="text-sm font-medium" style={{ color: tint.accent }}>
                  {daysLeft !== null ? td.daysSuffix : td.yearSuffix}
                </span>
              )}
            </div>
            <div className="text-micro mt-1.5 opacity-75" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>
              {details?.annualPremium ? td.annualPremiumPrefix.replace('{amount}', details.annualPremium.toLocaleString()) : ''}
              {details?.annualPremium && details?.termYears ? ` · ` : ''}
              {details?.termYears ? td.termYearsLine.replace('{n}', String(details.termYears)) : ''}
            </div>
          </>
        ) : (
          <>
            <div className="text-micro tracking-[1.5px] uppercase mt-1" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>{td.annualPremiumLabel}</div>
            {/* TODO(v0.17 currency): typographic split (small NT$ + large digits)
                 + termAndSumLine i18n template has "NT$" baked in — defer
                 migration until formatAmount supports digits-only mode. */}
            <div className="inline-flex items-baseline gap-1.5 mt-1.5">
              <span className="text-lg font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
              <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-lg)', fontWeight: 600, color: 'var(--ink)', letterSpacing: -1.5 }}>
                {details?.annualPremium?.toLocaleString() ?? '—'}
              </span>
            </div>
            {details?.termYears && details?.sumInsured && (
              <div className="text-micro mt-1.5 opacity-75" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>
                {td.termAndSumLine.replace('{n}', String(details.termYears)).replace('{sum}', details.sumInsured.toLocaleString())}
              </div>
            )}
          </>
        )}
      </div>

      {details?.startsAt && details?.endsAt && (
        <div className="mx-4 mt-[14px] p-4 rounded-2xl" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
          <div className="flex justify-between items-baseline">
            <span className="text-micro" style={{ color: 'var(--ink-2)' }}>{td.contractProgress}</span>
            <span className="text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              {td.yearsLeft.replace('{years}', yearsLeft.toFixed(1))}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(58,36,25,0.08)' }}>
            {/* .toFixed(2) — pct is recomputed from `new Date()` on both SSR and hydration; */}
            {/* without rounding, the few-ms wall-clock drift produces non-equal float strings */}
            {/* and React logs a hydration mismatch. Two decimal places of precision is more */}
            {/* than enough for a 1.5px-tall progress bar. */}
            <div className="h-full rounded-full" style={{ width: `${(pct * 100).toFixed(2)}%`, background: tint.accent }} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            <span>{details.startsAt}</span>
            <span>{details.endsAt}</span>
          </div>
        </div>
      )}

      <SectionHeader>{td.sectionContract}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.kind} value={details?.kind ? `${lookupKindLabel(details.kind, td)}${details.termYears ? td.termYearsParen.replace('{n}', String(details.termYears)) : ''}` : ''} />
        {/* #167 + #237 — display precedence: Child 愛物 > group member > freeform. */}
        <InfoRow label={td.insured} value={details?.insuredChildName ?? details?.insuredUserDisplayName ?? details?.insured ?? ''} />
        <InfoRow label={td.insurer} value={details?.insurer ?? ''} />
        <InfoRow label={td.policyNo} value={details?.policyNo ?? ''} mono />
        <InfoRow label={td.payCycle} value={lookupPayCycleLabel(details?.payCycle, td)} last />
      </InfoCard>

      <SectionHeader>{td.sectionMaturity}</SectionHeader>
      <InfoCard>
        <InfoRow label={td.startsAt} value={details?.startsAt ?? ''} mono />
        <InfoRow label={td.endsAt} value={details?.endsAt ?? ''} mono last />
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

      {/* Asset CRUD (onEditClick) is exempt from past-epoch guard, but FAB
          opens an AddSheet that creates a new transaction — hide it. */}
      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" hideFab={isPast} />
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        prefilledAssetId={assetId}
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
