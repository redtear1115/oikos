'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BottomNav } from '@/app/(dashboard)/_components/BottomNav'
import { AddSheet } from '@/app/(dashboard)/dashboard/_components/AddSheet'
import { AibutsuHeader, useTint } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol } from './aibutsu-ui'
import type { PlantDetailsRow } from '@/lib/db/queries/aibutsu'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

interface Props {
  assetId: string
  name: string
  details: PlantDetailsRow | null
  summary: AssetSummary
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

export function PlantDetailClient({ assetId, name, details, summary }: Props) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const tint = useTint('plant')
  const subtitle = details
    ? [details.species, details.location].filter(Boolean).join(' · ')
    : null

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader kind="plant" name={name} subtitle={subtitle || null} />

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

      <BottomNav onAddClick={() => setAddOpen(true)} fabVariant="primary" />
      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        prefilledAssetId={assetId}
        onMutated={() => router.refresh()}
      />
    </div>
  )
}
