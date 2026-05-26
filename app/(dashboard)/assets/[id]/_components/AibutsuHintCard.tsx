'use client'

import { useTranslations } from '@/lib/i18n/client'

type HintType = 'child' | 'pet' | 'plant' | 'house'

type HintStyle = {
  accentColor: string
  borderColor: string
}

const STYLE: Record<HintType, HintStyle> = {
  pet: { accentColor: '#9A6B3F', borderColor: 'rgba(154,107,63,0.35)' },
  child: { accentColor: '#A85B6A', borderColor: 'rgba(168,91,106,0.35)' },
  plant: { accentColor: '#5A7A4A', borderColor: 'rgba(90,122,74,0.35)' },
  house: { accentColor: '#7A5A38', borderColor: 'rgba(122,90,56,0.35)' },
}

interface AibutsuHintCardProps {
  type: HintType
  onCtaPress: () => void
}

export function AibutsuHintCard({ type, onCtaPress }: AibutsuHintCardProps) {
  const t = useTranslations()
  const style = STYLE[type]
  const items =
    type === 'pet' ? t.assetDetail.hint.itemsPet
    : type === 'child' ? t.assetDetail.hint.itemsChild
    : type === 'plant' ? t.assetDetail.hint.itemsPlant
    : t.assetDetail.hint.itemsHouse
  return (
    <div
      className="mx-4 rounded-bubble p-[14px]"
      style={{
        background: 'var(--surface)',
        border: `1.5px dashed ${style.borderColor}`,
      }}
    >
      <p
        className="text-micro font-medium mb-[5px]"
        style={{ color: style.accentColor, letterSpacing: '0.3px' }}
      >
        {t.assetDetail.hint.title}
      </p>
      <p
        className="text-micro mb-[10px]"
        style={{ color: 'var(--ink-2)', lineHeight: 1.9 }}
      >
        {items}
      </p>
      <button
        type="button"
        onClick={onCtaPress}
        className="w-full h-9 rounded-chip text-label font-medium text-white cursor-pointer"
        style={{
          background: 'var(--accent)',
          boxShadow: '0 2px 6px rgba(224,136,86,0.3)',
          letterSpacing: '0.2px',
        }}
      >
        {t.assetDetail.hint.cta}
      </button>
    </div>
  )
}
