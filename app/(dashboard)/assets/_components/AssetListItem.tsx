'use client'

import Link from 'next/link'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'
import { resolveDisplayName } from '@/lib/display-name'

const TYPE_LABEL: Record<string, string> = {
  car: '車', child: '孩子', pet: '寵物', plant: '植物',
  house: '房子', insurance: '保險',
}

interface Props {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  name: string
  /** Optional nickname; when present, primary line shows nickname and
   *  legal name slides into the right-aligned secondary slot. */
  nickname?: string | null
  plate: string | null
  monthAmount: number
  isLast?: boolean
}

export function AssetListItem({ id, type, name, nickname, plate, monthAmount, isLast }: Props) {
  const subtitle = type === 'car' ? (plate ?? '') : (TYPE_LABEL[type] ?? type)
  const display = resolveDisplayName(name, nickname)
  return (
    <Link
      href={`/assets/${id}`}
      className="flex items-center gap-3.5 px-5 py-4 no-underline"
      style={{
        color: 'var(--ink)',
        borderBottom: isLast ? 'none' : '1px solid var(--hairline)',
      }}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: 'var(--surface-alt)', color: 'var(--ink-2)' }}
      >
        <AssetIcon type={type} size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <div className="text-body font-semibold truncate">{display.primary}</div>
          {display.secondary && (
            <div
              className="text-xs truncate"
              style={{ color: 'var(--ink-3)' }}
            >
              {display.secondary}
            </div>
          )}
        </div>
        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>
          {subtitle}
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className="text-micro tracking-[0.4px]" style={{ color: 'var(--ink-3)' }}>本月</div>
        <div className="tnum text-sm font-medium" style={{ color: 'var(--ink)' }}>
          NT${monthAmount.toLocaleString('en-US')}
        </div>
      </div>
    </Link>
  )
}
