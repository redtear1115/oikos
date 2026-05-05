'use client'

interface Props {
  type: 'car' | 'house' | 'child' | 'insurance' | 'pet' | 'plant'
  size?: number
  color?: string
}

/**
 * Asset type icon. Slice 1 only renders 'car' meaningfully — other types
 * fall back to a neutral square placeholder (will be designed in slice 3+).
 */
export function AssetIcon({ type, size = 24, color = 'currentColor' }: Props) {
  if (type === 'car') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13l1.5-4.5A2 2 0 018.4 7h7.2a2 2 0 011.9 1.5L19 13" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <rect x="3.5" y="13" width="17" height="5" rx="1.5" stroke={color} strokeWidth="1.6" />
        <circle cx="7.5" cy="18" r="1.5" fill={color} />
        <circle cx="16.5" cy="18" r="1.5" fill={color} />
      </svg>
    )
  }
  // Slice 1 placeholder for other types
  return (
    <div
      style={{ width: size, height: size, background: 'var(--surface-alt)', borderRadius: 6 }}
      aria-hidden="true"
    />
  )
}
