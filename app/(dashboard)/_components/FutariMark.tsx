interface Props { size?: number }

// 雙葉印章 — 2026-05-04 設計師交付（chat 2 brand handoff）
// 來源：public/favicon.svg；inline 化用 var(--ink) / var(--accent) 取代 hardcoded 色，方便未來換主題
export function FutariMark({ size = 44 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g transform="translate(16 18.5) scale(0.55)">
        <path d="M 0 16 C -7 11, -15 6, -15 -2 C -15 -7, -11 -10, -7 -10 C -3 -10, -1 -8, 0 -5 Z" fill="var(--ink)" />
        <circle cx="-9" cy="-13" r="4" fill="var(--ink)" />
        <path d="M 0 16 C 7 11, 15 6, 15 -2 C 15 -7, 11 -10, 7 -10 C 3 -10, 1 -8, 0 -5 Z" fill="var(--accent)" />
        <circle cx="9" cy="-13" r="4" fill="var(--accent)" />
      </g>
    </svg>
  )
}
