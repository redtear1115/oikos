'use client'

const TINTS = {
  child:     { bg: '#F1DEE0', accent: '#A85B6A' },
  pet:       { bg: '#F0E2D0', accent: '#9A6B3F' },
  plant:     { bg: '#DCE7D6', accent: '#5A7A4A' },
  insurance: { bg: '#DDE5DC', accent: '#5A7A66' },
} as const

type TintKind = keyof typeof TINTS

interface AibutsuHeaderProps {
  kind: TintKind
  /** Page title — pass plain string, or wrap in <AssetSwitcher>...</AssetSwitcher>
   *  to make it a tappable switcher. */
  name: React.ReactNode
  subtitle?: string | null
  onEditClick?: () => void
}

export function AibutsuHeader({ kind, name, subtitle, onEditClick }: AibutsuHeaderProps) {
  const tint = TINTS[kind]
  return (
    <div className="px-5 pt-12 pb-3" style={{ background: tint.bg }}>
      <div className="flex items-center gap-3 mb-2">
        <a
          href="/assets"
          className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0"
          style={{ background: 'rgba(58,36,25,0.10)' }}
          aria-label="返回"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2l-5 5 5 5" stroke="#3A2419" strokeWidth="1.6"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-lg font-semibold min-w-0 leading-[30px]" style={{ color: '#3A2419' }}>{name}</div>
            {onEditClick && (
              <button
                onClick={onEditClick}
                className="w-[30px] h-[30px] rounded-[10px] shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(58,36,25,0.08)', border: 'none' }}
                aria-label="編輯"
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path d="M8.2 1.8l2 2-6.4 6.4-2.4.4.4-2.4 6.4-6.4z"
                    stroke="#3A2419" strokeWidth="1.2"
                    strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </button>
            )}
          </div>
          {subtitle && (
            <div
              className="text-[10px] mt-0.5 tracking-[0.8px]"
              style={{ color: 'rgba(58,36,25,0.55)', fontFamily: 'var(--font-numeric)' }}
            >{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function useTint(kind: TintKind) {
  return TINTS[kind]
}
