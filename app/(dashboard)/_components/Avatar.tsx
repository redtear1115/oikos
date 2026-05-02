interface Props {
  who: 'M' | 'T'           // viewer-relative: M = me, T = them (the partner)
  initial: string          // display_name[0] (uppercase recommended)
  size?: number
  ring?: boolean
}

export function Avatar({ who, initial, size = 28, ring = false }: Props) {
  const bg = who === 'M' ? 'var(--me-color)' : 'var(--them-color)'
  return (
    <div
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: bg,
        boxShadow: ring ? '0 0 0 2px var(--bg)' : 'none',
      }}
      className="rounded-full text-white flex items-center justify-center font-semibold tracking-tight shrink-0"
    >
      {initial}
    </div>
  )
}
