'use client'

import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-4 pt-2">
      <div className="rounded-[20px] p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <div className="flex justify-center mb-5">
          <FutariMark size={64} />
        </div>
        <div className="text-button font-semibold mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          還沒有紀錄
        </div>
        <div className="text-label leading-relaxed mb-6"
          style={{ color: 'var(--ink-2)' }}>
          從第一筆開始 ─ 一杯咖啡、<br />
          一頓晚餐都算數。<br />
          日子一天天記下來，回頭看會很暖。
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-5 h-11 rounded-xl text-white text-sm font-semibold cursor-pointer"
          style={{ background: 'var(--accent)', boxShadow: '0 2px 6px rgba(224,136,86,0.3)' }}>
          <PlusIcon size={16} />記第一筆
        </button>
      </div>
    </div>
  )
}
