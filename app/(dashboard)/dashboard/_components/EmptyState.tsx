'use client'

import { FutariMark } from '@/app/(dashboard)/_components/FutariMark'
import { PlusIcon } from '@/app/(dashboard)/_components/PlusIcon'
import { Button } from '@/components/ui/Button'
import { useTranslations } from '@/lib/i18n/client'
import { EmptyStateShell } from './EmptyStateShell'

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations()
  return (
    <EmptyStateShell
      variant="card"
      illustration={
        <div className="flex justify-center mb-5">
          <FutariMark size={64} />
        </div>
      }
      title={
        <div
          className="text-base font-medium mb-2"
          style={{ fontFamily: 'var(--font-serif)', color: 'var(--ink)' }}
        >
          {t.feed.noRecordsTitle}
        </div>
      }
      caption={
        <div className="text-sm leading-relaxed mb-6" style={{ color: 'var(--ink-2)' }}>
          {t.feed.noRecordsHint}
        </div>
      }
      cta={
        /* The one ember moment in the empty state: the accent commit. Flat by
           default, so no drop-shadow; the ember fill + hairline card carry it. */
        <Button variant="accent" onClick={onAdd}>
          <PlusIcon size={16} />{t.feed.addFirst}
        </Button>
      }
    />
  )
}
