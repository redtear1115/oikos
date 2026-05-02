interface IconProps { active: boolean; color: string }

export function NavHomeIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M3.5 10.2 L11 4 L18.5 10.2 V17.5 a1 1 0 0 1 -1 1 H4.5 a1 1 0 0 1 -1 -1 Z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
        fill={active ? color : 'none'} fillOpacity={active ? 0.10 : 0}
      />
      <path d="M9 18.5 V13.5 a1 1 0 0 1 1 -1 h2 a1 1 0 0 1 1 1 V18.5"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function NavListIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5.5 6 H16.5" stroke={color} strokeWidth={active ? 2 : 1.5} strokeLinecap="round"/>
      <path d="M5.5 11 H16.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5.5 16 H12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="3" cy="6" r="1.1" fill={color}/>
      <circle cx="3" cy="11" r="1.1" fill={color} opacity={active ? 1 : 0.4}/>
      <circle cx="3" cy="16" r="1.1" fill={color} opacity={active ? 1 : 0.4}/>
    </svg>
  )
}

export function NavAssetsIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.6"
        stroke={color} strokeWidth="1.5"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
      <rect x="12" y="3.5" width="6.5" height="6.5" rx="1.6"
        stroke={color} strokeWidth="1.5"/>
      <rect x="3.5" y="12" width="6.5" height="6.5" rx="1.6"
        stroke={color} strokeWidth="1.5"/>
      <rect x="12" y="12" width="6.5" height="6.5" rx="1.6"
        stroke={color} strokeWidth="1.5"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
    </svg>
  )
}

export function NavSettingsIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="8" r="3.2"
        stroke={color} strokeWidth="1.5"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
      <path d="M4.5 18.5 a6.5 6.5 0 0 1 13 0"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
    </svg>
  )
}
