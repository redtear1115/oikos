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

  if (type === 'pet') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* paw print: 1 large pad + 4 toe pads */}
        <ellipse cx="12" cy="15" rx="4" ry="3.5" fill={color} opacity="0.9" />
        <circle cx="7.5" cy="10.5" r="1.6" fill={color} />
        <circle cx="11" cy="8.5" r="1.6" fill={color} />
        <circle cx="13" cy="8.5" r="1.6" fill={color} />
        <circle cx="16.5" cy="10.5" r="1.6" fill={color} />
      </svg>
    )
  }

  if (type === 'plant') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* stem */}
        <path d="M12 19V10" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        {/* left leaf */}
        <path d="M12 14C12 14 9 13 8 10C8 10 11 9 12 12" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
        {/* right leaf */}
        <path d="M12 11C12 11 15 10 16 7C16 7 13 6 12 9" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15" />
        {/* pot */}
        <path d="M9 19h6M9.5 19l.5-2h4l.5 2" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === 'child') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {/* head */}
        <circle cx="12" cy="8" r="3.2" fill={color} opacity="0.9" />
        {/* body */}
        <path d="M6.5 20c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    )
  }

  // Placeholder for other types (house, insurance)
  return (
    <div
      style={{ width: size, height: size, background: 'var(--surface-alt)', borderRadius: 6 }}
      aria-hidden="true"
    />
  )
}
