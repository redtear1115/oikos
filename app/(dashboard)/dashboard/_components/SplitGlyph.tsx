'use client'

interface Props { kind: 'all_mine' | 'all_theirs' | 'half'; active: boolean }

export function SplitGlyph({ kind, active }: Props) {
  const fillMe = active ? 'var(--ink)' : 'var(--ink-3)'
  const fillThem = active ? 'var(--accent)' : '#C7BFB3'
  const left = kind === 'all_mine' ? '100%' : kind === 'all_theirs' ? '0%' : '50%'
  return (
    <div className="w-11 h-11 rounded-xl relative overflow-hidden flex items-center justify-center shrink-0"
      style={{ background: 'rgba(31,27,22,0.06)' }}>
      <div className="absolute left-1.5 right-1.5 top-[18px] h-2 rounded-[4px] overflow-hidden"
        style={{ background: fillThem }}>
        <div className="absolute left-0 top-0 bottom-0 transition-[width] duration-200"
          style={{ width: left, background: fillMe }} />
      </div>
      <div className="absolute left-1.5 top-1.5 w-2 h-2 rounded-full" style={{ background: fillMe }} />
      <div className="absolute right-1.5 top-1.5 w-2 h-2 rounded-full" style={{ background: fillThem }} />
    </div>
  )
}
