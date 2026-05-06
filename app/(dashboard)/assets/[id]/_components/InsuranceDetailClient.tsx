'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AssetSheet, type AssetSheetInitial } from '@/app/(dashboard)/assets/_components/AssetSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { AssetSwitcher } from './AssetSwitcher'
import { SectionHeader, InfoCard, InfoRow } from './aibutsu-ui'
import type { InsuranceDetailsRow } from '@/lib/db/queries/aibutsu'

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'

const KIND_LABELS: Record<string, string> = {
  medical: '醫療', life: '壽險', accident: '意外',
  cancer: '癌症', illness: '重大傷病', car: '汽車',
}

const PAY_CYCLE_LABELS: Record<string, string> = {
  annual: '年繳', semi: '半年繳', quarterly: '季繳', monthly: '月繳',
}

interface Props {
  assetId: string
  name: string
  details: InsuranceDetailsRow | null
  linkedVehicle?: { id: string; name: string } | null
  assetSheetInitial: AssetSheetInitial
  allAssets: Array<{ id: string; name: string; type: AssetType }>
}

export function InsuranceDetailClient({ assetId, name, details, linkedVehicle, assetSheetInitial, allAssets }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const tint = useTint('insurance')

  const handleAssetMutated = (kind: 'saved' | 'deleted') => {
    if (kind === 'deleted') { router.replace('/assets'); return }
    router.refresh()
  }
  const subtitle = details
    ? [details.insurer, details.kind ? KIND_LABELS[details.kind] : null].filter(Boolean).join(' · ')
    : null

  let pct = 0
  let yearsLeft = 0
  if (details?.startsAt && details?.endsAt) {
    const start = new Date(details.startsAt)
    const end = new Date(details.endsAt)
    const now = new Date()
    pct = Math.max(0, Math.min(1, (now.getTime() - start.getTime()) / (end.getTime() - start.getTime())))
    yearsLeft = Math.max(0, (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader
        kind="insurance"
        name={
          <AssetSwitcher currentAssetId={assetId} allAssets={allAssets}>
            <span>{name}</span>
          </AssetSwitcher>
        }
        subtitle={subtitle || null}
        onEditClick={() => setEditOpen(true)}
      />

      <div className="px-5 pb-6 text-center" style={{ background: tint.bg }}>
        <div className="text-micro tracking-[1.5px] uppercase mt-1" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>年繳保費</div>
        <div className="inline-flex items-baseline gap-1.5 mt-1.5">
          <span className="text-lg font-medium" style={{ color: 'var(--ink-2)' }}>NT$</span>
          <span className="tabular-nums leading-none" style={{ fontFamily: 'var(--font-numeric)', fontSize: 'var(--fs-amount-lg)', fontWeight: 600, color: 'var(--ink)', letterSpacing: -1.5 }}>
            {details?.annualPremium?.toLocaleString() ?? '—'}
          </span>
        </div>
        {details?.termYears && details?.sumInsured && (
          <div className="text-micro mt-1.5 opacity-75" style={{ color: tint.accent, fontFamily: 'var(--font-numeric)' }}>
            {details.termYears} 年期 · 保額 NT$ {details.sumInsured.toLocaleString()}
          </div>
        )}
      </div>

      {details?.startsAt && details?.endsAt && (
        <div className="mx-4 mt-[14px] p-4 rounded-2xl" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
          <div className="flex justify-between items-baseline">
            <span className="text-micro" style={{ color: 'var(--ink-2)' }}>合約進度</span>
            <span className="text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
              還剩 {yearsLeft.toFixed(1)} 年
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(58,36,25,0.08)' }}>
            <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: tint.accent }} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-numeric)' }}>
            <span>{details.startsAt}</span>
            <span>{details.endsAt}</span>
          </div>
        </div>
      )}

      <SectionHeader>合約資訊</SectionHeader>
      <InfoCard>
        <InfoRow label="險種" value={details?.kind ? `${KIND_LABELS[details.kind] ?? details.kind}${details.termYears ? `（${details.termYears} 年期）` : ''}` : ''} />
        <InfoRow label="被保人" value={details?.insured ?? ''} />
        <InfoRow label="保險公司" value={details?.insurer ?? ''} />
        <InfoRow label="保單號" value={details?.policyNo ?? ''} mono />
        <InfoRow label="繳費週期" value={details?.payCycle ? PAY_CYCLE_LABELS[details.payCycle] ?? details.payCycle : ''} last />
      </InfoCard>

      <SectionHeader>到期資訊</SectionHeader>
      <InfoCard>
        <InfoRow label="保單起" value={details?.startsAt ?? ''} mono />
        <InfoRow label="保單迄" value={details?.endsAt ?? ''} mono last />
      </InfoCard>

      {linkedVehicle && (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--hairline)' }}>
          <div className="px-5 py-4">
            <div className="text-xs font-medium tracking-[0.5px] mb-2" style={{ color: 'var(--ink-3)' }}>
              關聯車輛
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

      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" />
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
