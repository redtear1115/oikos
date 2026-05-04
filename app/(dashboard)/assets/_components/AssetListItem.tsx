'use client'

import Link from 'next/link'
import { AssetIcon } from '@/app/(dashboard)/_components/AssetIcon'

interface Props {
  id: string
  type: 'car' | 'house' | 'child' | 'insurance'
  name: string
  subtitle: string  // e.g. plate "ABC-1234"
  monthAmount: number
  isLast?: boolean
}

export function AssetListItem({ id, type, name, subtitle, monthAmount, isLast }: Props) {
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
        <div className="text-[15px] font-semibold truncate">{name}</div>
        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--ink-3)' }}>
          {subtitle}
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className="text-[11px] tracking-[0.4px]" style={{ color: 'var(--ink-3)' }}>本月</div>
        <div className="tnum text-sm font-medium" style={{ color: 'var(--ink)' }}>
          NT${monthAmount.toLocaleString('en-US')}
        </div>
      </div>
    </Link>
  )
}
