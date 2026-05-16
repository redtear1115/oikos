'use client'

import Link from 'next/link'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { resolveDisplayName } from '@/lib/display-name'
import { formatAmount } from '@/lib/currency'

type AssetType = 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant' | 'item'

const TYPE_LABEL: Record<AssetType, string> = {
  car: '車', child: '孩子', pet: '寵物', plant: '植物',
  house: '房子', insurance: '保險', item: '物品',
}

const TYPE_TINT: Record<AssetType, string> = {
  house: 'var(--asset-tint-house)',
  car: 'var(--asset-tint-car)',
  child: 'var(--asset-tint-child)',
  pet: 'var(--asset-tint-pet)',
  plant: 'var(--asset-tint-plant)',
  insurance: 'var(--asset-tint-insurance)',
  item: 'var(--asset-tint-item)',
}

interface Props {
  id: string
  type: AssetType
  name: string
  /** Optional nickname; when present, primary line shows nickname and
   *  legal name slides into the right-aligned secondary slot. */
  nickname?: string | null
  plate: string | null
  monthAmount: number
  /** Insurance-only: render the 「儲蓄」badge on the subtitle row. */
  isSavings?: boolean
  isLast?: boolean
}

export function AssetListItem({ id, type, name, nickname, plate, monthAmount, isSavings, isLast }: Props) {
  const subtitle = type === 'car' ? (plate ?? '') : TYPE_LABEL[type]
  const display = resolveDisplayName(name, nickname)
  const tint = TYPE_TINT[type]
  return (
    <Link
      href={`/assets/${id}`}
      className="flex items-center gap-3 px-[14px] py-3 no-underline"
      style={{
        color: 'var(--ink)',
        borderLeft: `3px solid ${tint}`,
        borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
      }}
    >
      {/* 32×32 tint square matches CategoryChip on /records (size={32}) so
          asset rows read at the same density as transaction rows. The earlier
          40×40 made /assets feel ~16px taller than every other list. */}
      <div
        className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: tint, color: 'var(--ink-2)' }}
      >
        <AssetIcon type={type} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <div className="text-sm font-semibold truncate">{display.primary}</div>
          {display.secondary && (
            <div
              className="text-xs truncate"
              style={{ color: 'var(--ink-3)' }}
            >
              {display.secondary}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          {isSavings && (
            <span
              className="font-mono shrink-0 px-1.5 py-px rounded-[4px] leading-none"
              style={{
                fontSize: 11,
                background: 'var(--saving-soft)',
                color: 'var(--saving)',
              }}
            >
              儲蓄
            </span>
          )}
          <span className="text-xs truncate" style={{ color: 'var(--ink-3)' }}>
            {subtitle}
          </span>
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className="text-micro tracking-[0.4px]" style={{ color: 'var(--ink-3)' }}>本月</div>
        <div className="tnum text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {formatAmount(monthAmount, 'twd')}
        </div>
      </div>
    </Link>
  )
}
