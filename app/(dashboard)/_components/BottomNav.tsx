'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PlusIcon } from './PlusIcon'
import { HomeIndicator } from './HomeIndicator'
import { NavHomeIcon, NavListIcon, NavAssetsIcon, NavSettingsIcon } from './TabIcons'

interface Props {
  onAddClick: () => void
  hideFab?: boolean
  fabVariant?: 'primary' | 'accent'
  /** Custom FAB content. When provided, the default circular FAB is replaced
   *  with a wider pill that contains this node (e.g. "加油" + fuel pump icon). */
  fabContent?: React.ReactNode
}

const TABS = [
  { id: 'home', label: '首頁', href: '/dashboard', icon: NavHomeIcon },
  { id: 'list', label: '紀錄', href: '/records', icon: NavListIcon },
  { id: 'assets', label: '愛物', href: '/assets', icon: NavAssetsIcon },
  { id: 'settings', label: '設定', href: '/settings', icon: NavSettingsIcon },
] as const

export function BottomNav({ onAddClick, hideFab = false, fabVariant = 'primary', fabContent }: Props) {
  const pathname = usePathname()

  const getActiveTab = (): typeof TABS[number]['id'] => {
    if (pathname === '/dashboard') return 'home'
    if (pathname === '/records') return 'list'
    if (pathname.startsWith('/assets')) return 'assets'
    if (pathname === '/settings') return 'settings'
    return 'home'
  }

  const activeId = getActiveTab()

  return (
    <>
      <div className="fixed left-1/2 bottom-0 z-[80] h-[78px] w-full max-w-md -translate-x-1/2 flex pb-[22px]"
        style={{ background: 'var(--surface)', borderTop: '1px solid var(--hairline)' }}>
        <NavTab tab={TABS[0]} active={activeId === TABS[0].id} />
        <NavTab tab={TABS[1]} active={activeId === TABS[1].id} />
        <div className="w-[76px] shrink-0" />
        <NavTab tab={TABS[2]} active={activeId === TABS[2].id} />
        <NavTab tab={TABS[3]} active={activeId === TABS[3].id} />
      </div>

      {!hideFab && !fabContent && (
        <button
          onClick={onAddClick}
          aria-label="新增一筆"
          className="fixed left-1/2 bottom-[30px] z-[85] -translate-x-1/2 w-[60px] h-[60px] rounded-full border-0 flex items-center justify-center cursor-pointer"
          style={{
            background: fabVariant === 'accent' ? 'var(--accent)' : 'var(--ink)',
            color: '#fff',
            boxShadow: '0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)',
          }}>
          <PlusIcon size={26} />
        </button>
      )}

      {!hideFab && fabContent && (
        <button
          onClick={onAddClick}
          className="fixed left-1/2 bottom-[34px] z-[85] -translate-x-1/2 h-[60px] rounded-full border-0 inline-flex items-center justify-center gap-2 px-5 cursor-pointer text-white text-sm font-semibold tracking-[0.5px]"
          style={{
            background: fabVariant === 'accent' ? 'var(--accent)' : 'var(--ink)',
            boxShadow: '0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)',
          }}>
          {fabContent}
        </button>
      )}

      <HomeIndicator />
    </>
  )
}

function NavTab({ tab, active }: { tab: typeof TABS[number]; active: boolean }) {
  const Icon = tab.icon
  const color = active ? 'var(--ink)' : 'var(--ink-3)'
  return (
    <Link href={tab.href} className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 no-underline"
      style={{ color }}>
      <Icon active={active} color={active ? '#3A2419' : '#B89C8B'} />
      <span className="text-[10px] tracking-[0.4px]" style={{ fontWeight: active ? 600 : 400 }}>
        {tab.label}
      </span>
    </Link>
  )
}
