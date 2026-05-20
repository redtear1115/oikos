interface Props {
  kind: 'all_mine' | 'all_theirs' | 'half' | 'weighted'
  active: boolean
  ratioA?: number  // 1–99; only used when kind = 'weighted'
}

export function SplitGlyph({ kind, active, ratioA }: Props) {
  const fillMe = active ? 'var(--ink)' : 'var(--ink-3)'
  const fillThem = active ? 'var(--accent)' : '#C7BFB3'
  let left: string
  if (kind === 'all_mine') left = '100%'
  else if (kind === 'all_theirs') left = '0%'
  else if (kind === 'weighted') left = `${ratioA ?? 50}%`
  else left = '50%'  // half

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
