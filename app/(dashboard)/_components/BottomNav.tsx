'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { PlusIcon } from './PlusIcon'
import { HomeIndicator } from './HomeIndicator'
import { NavHomeIcon, NavListIcon, NavAssetsIcon, NavSettingsIcon } from './TabIcons'
import { DEFAULT_INCOME_PALETTE } from '@/lib/incomePalettes'
import { useTranslations } from '@/lib/i18n/client'

interface Props {
  onAddClick: () => void
  hideFab?: boolean
  fabVariant?: 'primary' | 'accent' | 'income'
  /** Custom FAB content. When provided, the default circular FAB is replaced
   *  with a wider pill that contains this node (e.g. "加油" + fuel pump icon). */
  fabContent?: React.ReactNode
}

function fabBg(variant: 'primary' | 'accent' | 'income'): string {
  if (variant === 'accent') return 'var(--accent)'
  if (variant === 'income') return DEFAULT_INCOME_PALETTE.ink
  return 'var(--ink)'
}

const TABS = [
  { id: 'home'    as const, href: '/dashboard', icon: NavHomeIcon     },
  { id: 'list'    as const, href: '/records',   icon: NavListIcon     },
  { id: 'assets'  as const, href: '/assets',    icon: NavAssetsIcon   },
  { id: 'settings' as const, href: '/settings', icon: NavSettingsIcon },
] as const

export function BottomNav({ onAddClick, hideFab = false, fabVariant = 'primary', fabContent }: Props) {
  const t = useTranslations()
  const pathname = usePathname()

  // Defer auto-prefetch of the four tab destinations until after the host page
  // has had time to settle. Prefetching four parallel routes immediately on
  // cold-start contends with the main page's data fetch.
  const [allowPrefetch, setAllowPrefetch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setAllowPrefetch(true), { timeout: 1500 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(() => setAllowPrefetch(true), 1500)
    return () => clearTimeout(t)
  }, [])

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
      {/*
        Nav structure: 56px nav-content row + env(safe-area-inset-bottom) home-indicator zone.
        Old fixed 78px total assumed a 22px indicator zone — wrong on iPhone 14+ / Pro Max
        where safe-area is 34px and the indicator zone is taller. FAB positions follow.
      */}
      <nav aria-label={t.bottomNav.navAriaLabel}
        className="fixed left-1/2 bottom-0 z-[80] w-full max-w-md -translate-x-1/2 flex"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--hairline)',
          height: 'calc(56px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
        <NavTab tab={TABS[0]} label={t.bottomNav.home}     active={activeId === TABS[0].id} allowPrefetch={allowPrefetch} />
        <NavTab tab={TABS[1]} label={t.bottomNav.records}  active={activeId === TABS[1].id} allowPrefetch={allowPrefetch} />
        <div className="w-[76px] shrink-0" />
        <NavTab tab={TABS[2]} label={t.bottomNav.assets}   active={activeId === TABS[2].id} allowPrefetch={allowPrefetch} />
        <NavTab tab={TABS[3]} label={t.bottomNav.settings} active={activeId === TABS[3].id} allowPrefetch={allowPrefetch} />
      </nav>

      {!hideFab && !fabContent && (
        <button
          onClick={onAddClick}
          aria-label={t.bottomNav.addAriaLabel}
          className="fixed left-1/2 z-[85] -translate-x-1/2 w-[60px] h-[60px] rounded-full border-0 flex items-center justify-center cursor-pointer"
          style={{
            bottom: 'calc(8px + env(safe-area-inset-bottom))',
            background: fabBg(fabVariant),
            color: '#fff',
            boxShadow: '0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)',
          }}>
          <PlusIcon size={26} />
        </button>
      )}

      {!hideFab && fabContent && (
        <button
          onClick={onAddClick}
          className="fixed left-1/2 z-[85] -translate-x-1/2 h-[60px] rounded-full border-0 inline-flex items-center justify-center gap-2 px-5 cursor-pointer text-white text-sm font-semibold tracking-[0.5px]"
          style={{
            bottom: 'calc(12px + env(safe-area-inset-bottom))',
            background: fabBg(fabVariant),
            boxShadow: '0 8px 22px rgba(31,27,22,0.28), 0 0 0 5px var(--surface)',
          }}>
          {fabContent}
        </button>
      )}

      <HomeIndicator />
    </>
  )
}

function NavTab({ tab, label, active, allowPrefetch }: { tab: typeof TABS[number]; label: string; active: boolean; allowPrefetch: boolean }) {
  const Icon = tab.icon
  const color = active ? 'var(--ink)' : 'var(--ink-3)'
  return (
    <Link
      href={tab.href}
      prefetch={allowPrefetch ? true : false}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className="flex-1 flex flex-col items-center justify-center gap-1 pt-2 no-underline"
      style={{ color }}>
      <Icon active={active} color={active ? '#3A2419' : '#B89C8B'} />
      <span className="text-micro tracking-[0.4px]" style={{ fontWeight: active ? 600 : 400 }}>
        {label}
      </span>
    </Link>
  )
}
