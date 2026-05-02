'use client'

interface Props { onKey: (k: string) => void }

const KEYS = ['1','2','3','4','5','6','7','8','9','00','0','del']

export function Numpad({ onKey }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1.5 px-1.5 pt-2 pb-2.5"
      style={{ background: '#E5E0D6', borderTop: '1px solid var(--hairline)' }}>
      {KEYS.map(k => (
        <button key={k} onClick={() => onKey(k)}
          className="h-[46px] rounded-lg border-0 cursor-pointer flex items-center justify-center tnum"
          style={{
            background: k === 'del' ? 'transparent' : 'var(--surface)',
            color: 'var(--ink)',
            fontFamily: 'var(--font-numeric)',
            fontSize: 24,
            fontWeight: 400,
            boxShadow: k === 'del' ? 'none' : '0 1px 0 rgba(0,0,0,0.06)',
          }}>
          {k === 'del' ? (
            <svg width="24" height="18" viewBox="0 0 24 18" fill="none">
              <path d="M8 1h13a2 2 0 012 2v12a2 2 0 01-2 2H8L1 9 8 1z"
                stroke="#1F1B16" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M11 6l6 6M17 6l-6 6"
                stroke="#1F1B16" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : k}
        </button>
      ))}
    </div>
  )
}
