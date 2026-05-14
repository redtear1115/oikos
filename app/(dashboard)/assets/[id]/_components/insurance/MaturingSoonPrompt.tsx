'use client'

import { useLocale, useTranslations } from '@/lib/i18n/client'
import { formatDateAbsolute } from '@/lib/format-date'

interface Props {
  maturityDate: string
  onClick: () => void
}

export function MaturingSoonPrompt({ maturityDate, onClick }: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const ts = t.assetDetail.savings
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl px-4 py-3 text-left flex items-center gap-3"
      style={{
        background: 'rgba(168, 220, 196, 0.18)',
        border: '1px dashed rgba(168, 220, 196, 0.5)',
      }}
    >
      <div className="flex-1">
        <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {ts.maturingSoonTitle.replace('{date}', formatDateAbsolute(maturityDate, locale))}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--ink-2)' }}>
          {ts.maturingSoonSubtitle}
        </div>
      </div>
      <span className="text-sm font-medium shrink-0" style={{ color: 'var(--ink)' }}>
        {ts.maturingSoonCta}
      </span>
    </button>
  )
}
