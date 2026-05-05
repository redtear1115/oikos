'use client'

import { AibutsuHeader, useTint } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol, AgeDisplay } from './aibutsu-ui'
import type { PetDetailsRow } from '@/lib/db/queries/aibutsu'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

interface Props {
  assetId: string
  name: string
  details: PetDetailsRow | null
  summary: AssetSummary
}

export function PetDetailClient({ assetId, name, details, summary }: Props) {
  const tint = useTint('pet')
  const subtitle = details
    ? [details.species, details.breed,
        details.sex === 'female' ? '女孩'
          : details.sex === 'male' ? '男孩'
          : details.sex === 'unknown' ? '不明'
          : null
      ].filter(Boolean).join(' · ')
    : null

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader kind="pet" name={name} subtitle={subtitle || null} />

      {details?.birthDate && (
        <div className="px-5 pb-6" style={{ background: tint.bg }}>
          <AgeDisplay birth={details.birthDate} accent={tint.accent} />
        </div>
      )}

      <MoneyTwoCol month={summary.monthAmount} total={summary.totalAmount} accent={tint.accent} />

      <SectionHeader>來到家裡</SectionHeader>
      <InfoCard>
        <InfoRow label="出生日" value={details?.birthDate ?? ''} mono />
        <InfoRow label="到家日" value={details?.adoptedDate ?? ''} mono />
        <InfoRow label="領養金額" value={details?.purchaseCost ? `NT$ ${details.purchaseCost.toLocaleString()}` : ''} mono />
        <InfoRow label="目前體重" value={details?.weightG ? `${(details.weightG / 1000).toFixed(1)} kg` : ''} mono last />
      </InfoCard>

      <SectionHeader>健康 / 證件</SectionHeader>
      <InfoCard>
        <InfoRow label="晶片號" value={details?.chipNo ?? ''} mono />
        <InfoRow label="獸醫院" value={details?.vet ?? ''} last />
      </InfoCard>
    </div>
  )
}
