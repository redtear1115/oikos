'use client'

import { AibutsuHeader, useTint } from './AibutsuHeader'
import { SectionHeader, InfoCard, InfoRow, MoneyTwoCol, AgeDisplay } from './aibutsu-ui'
import type { ChildDetailsRow } from '@/lib/db/queries/aibutsu'

interface AssetSummary {
  monthAmount: number
  totalAmount: number
}

interface Props {
  assetId: string
  name: string
  details: ChildDetailsRow | null
  summary: AssetSummary
}

export function ChildDetailClient({ assetId, name, details, summary }: Props) {
  const tint = useTint('child')
  const subtitle = details
    ? [
        details.gender === 'male' ? '男' : details.gender === 'female' ? '女' : null,
        details.bloodType ? `${details.bloodType} 型` : null
      ].filter(Boolean).join(' · ')
    : null

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg)' }}>
      <AibutsuHeader kind="child" name={name} subtitle={subtitle || null} />

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
    </div>
  )
}
