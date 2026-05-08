'use client'

import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { useTranslations } from '@/lib/i18n/client'

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations()
  return (
    <div className="px-4 pt-2">
      <div className="rounded-[20px] p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <div className="flex justify-center mb-5">
          <FutariMark size={64} />
        </div>
        <div className="text-button font-semibold mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {t.feed.noRecordsTitle}
        </div>
        <div className="text-label leading-relaxed mb-6"
          style={{ color: 'var(--ink-2)' }}>
          {t.feed.noRecordsHint}
        </div>
        <button onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-5 h-11 rounded-xl text-white text-sm font-semibold cursor-pointer"
          style={{ background: 'var(--accent)', boxShadow: '0 2px 6px rgba(224,136,86,0.3)' }}>
          <PlusIcon size={16} />{t.feed.addFirst}
        </button>
      </div>
    </div>
  )
}
