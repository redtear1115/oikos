interface Props { size?: number }

export function FutariMark({ size = 44 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="29.5"
        stroke="var(--accent)" strokeOpacity="0.30" strokeWidth="1.3"
        strokeDasharray="1.5 3" fill="none" />
      <circle cx="56.5" cy="14.5" r="2.2" fill="var(--accent)" />
      <path d="M 8.5 49 a 2.6 2.6 0 1 0 2.4 -2 a 2 2 0 0 1 -2.4 2 z"
        fill="var(--accent)" opacity="0.85" />
      <path d="M 32 54 C 22 47, 12 40, 12 30 C 12 23, 17 19, 22 19 C 27 19, 30 22, 32 26 Z"
        fill="var(--ink)" />
      <circle cx="20" cy="14" r="5" fill="var(--ink)" />
      <path d="M 32 54 C 42 47, 52 40, 52 30 C 52 23, 47 19, 42 19 C 37 19, 34 22, 32 26 Z"
        fill="var(--accent)" />
      <circle cx="44" cy="14" r="5" fill="var(--accent)" />
    </svg>
  )
}
