'use client'

import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations()
  return (
    <div className="px-4 pt-2">
      <div className="rounded-card p-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
        <div className="flex justify-center mb-5">
          <FutariMark size={64} />
        </div>
        <div className="text-button font-medium mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}>
          {t.feed.noRecordsTitle}
        </div>
        <div className="text-sm leading-relaxed mb-6"
          style={{ color: 'var(--ink-2)' }}>
          {t.feed.noRecordsHint}
        </div>
        {/* The one ember moment in the empty state: the accent commit. Flat by
            default, so no drop-shadow; the ember fill + hairline card carry it. */}
        <Button variant="accent" onClick={onAdd}>
          <PlusIcon size={16} />{t.feed.addFirst}
        </Button>
      </div>
    </div>
  )
}
