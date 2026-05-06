'use client'

type HintType = 'child' | 'pet' | 'plant' | 'house'

type HintConfig = {
  accentColor: string
  borderColor: string
  items: string
}

const CONFIG: Record<HintType, HintConfig> = {
  pet: {
    accentColor: '#9A6B3F',
    borderColor: 'rgba(154,107,63,0.35)',
    items: '飼料 · 看診 · 洗澡美容 · 玩具 · 年度疫苗',
  },
  child: {
    accentColor: '#A85B6A',
    borderColor: 'rgba(168,91,106,0.35)',
    items: '尿布奶粉 · 看診 · 課後安親 · 玩具 · 學費',
  },
  plant: {
    accentColor: '#5A7A4A',
    borderColor: 'rgba(90,122,74,0.35)',
    items: '介質 · 盆器 · 肥料 · 買新苗 · 防蟲',
  },
  house: {
    accentColor: '#7A5A38',
    borderColor: 'rgba(122,90,56,0.35)',
    items: '房貸 · 水電 · 管理費 · 維修 · 裝潢 · 清潔',
  },
}

interface AibutsuHintCardProps {
  type: HintType
  onCtaPress: () => void
}

export function AibutsuHintCard({ type, onCtaPress }: AibutsuHintCardProps) {
  const cfg = CONFIG[type]
  return (
    <div
      className="mx-4 rounded-[14px] p-[14px]"
      style={{
        background: 'var(--surface)',
        border: `1.5px dashed ${cfg.borderColor}`,
      }}
    >
      <p
        className="text-[11px] font-semibold mb-[5px]"
        style={{ color: cfg.accentColor, letterSpacing: '0.3px' }}
      >
        ✦ 可以記什麼？
      </p>
      <p
        className="text-[11px] mb-[10px]"
        style={{ color: 'var(--ink-2)', lineHeight: 1.9 }}
      >
        {cfg.items}
      </p>
      <button
        type="button"
        onClick={onCtaPress}
        className="w-full h-9 rounded-[10px] text-[12px] font-semibold text-white cursor-pointer"
        style={{
          background: 'var(--accent)',
          boxShadow: '0 2px 6px rgba(224,136,86,0.3)',
          letterSpacing: '0.2px',
        }}
      >
        記第一筆 →
      </button>
    </div>
  )
}
