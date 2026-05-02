'use client'

import Link from 'next/link'
import { CompactRow, type CompactRowProps } from './CompactRow'

export function RecentList({ items }: { items: CompactRowProps['tx'][] }) {
  return (
    <div className="pt-1 pb-5">
      <div className="flex items-center justify-between px-6 py-2.5">
        <span className="text-xs font-medium tracking-[0.5px]" style={{ color: 'var(--ink-2)' }}>
          最近紀錄
        </span>
        <Link
          href="/coming-soon?next=list"
          className="text-[11px] no-underline"
          style={{ color: 'var(--ink-3)' }}
        >
          查看全部 →
        </Link>
      </div>
      <div
        className="mx-4 rounded-[18px] overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
      >
        {items.map((tx, i) => (
          <CompactRow key={tx.id} tx={tx} isLast={i === items.length - 1} />
        ))}
      </div>
    </div>
  )
}
