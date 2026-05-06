interface IconProps { active: boolean; color: string }

export function NavHomeIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
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
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="18" height="15" rx="2.4"
        stroke={color} strokeWidth="1.5"
        fill={active ? color : 'none'} fillOpacity={active ? 0.10 : 0}/>
      <path d="M5.5 8 H16.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5.5 11 H16.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5.5 14 H12" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function NavAssetsIcon({ active, color }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
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
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="8" r="3.2"
        stroke={color} strokeWidth="1.5"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
      <path d="M4.5 18.5 a6.5 6.5 0 0 1 13 0"
        stroke={color} strokeWidth="1.5" strokeLinecap="round"
        fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0}/>
    </svg>
  )
}
