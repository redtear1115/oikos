// #1249 — three a11y regressions on /assets that all shared one property:
// nothing about them is visible, so only an assertion can hold them down.
//
//   1. The asset-switcher pill is rendered as the page's <h1> content. It used
//      to carry `aria-label`, which overrides the subtree — so both the button
//      AND the heading announced "Switch aibutsu" instead of the policy name.
//      The screen looks completely normal.
//   2. That same pill needs a ::before to reach a 44px hit area, and the <h1>
//      carried `truncate` (overflow: hidden), which clipped the ::before — and
//      with it the hit test — back to the 30px box. The pill renders
//      identically; it just stops responding 7px outside itself.
//   3. The car-colour swatches used the stored key as their accessible name,
//      so every locale heard "dark_gray" / "champagne" read out in English.
//
// Failure looks like: nothing. No test goes red, no build warning, no visual
// diff. You find out by putting a thumb on the control or a screen reader on
// the page.

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/assets',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({
    viewer: { id: 'u1', displayName: 'Me' },
    partner: null,
    isPast: false,
    canAccessGuardian: false,
  }),
}))
vi.mock('@/actions/asset', () => ({
  createCar: vi.fn(),
  editCar: vi.fn(),
  softDeleteAsset: vi.fn(),
}))

import { AibutsuHeader } from '@/app/(dashboard)/assets/[id]/_components/AibutsuHeader'
import { AssetSwitcher } from '@/app/(dashboard)/assets/[id]/_components/AssetSwitcher'
import { CarSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/CarSheetBody'

function wrap(value: typeof en, locale: 'en' | 'ja' | 'zh-TW') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <TranslationsProvider value={value} locale={locale}>
        {children}
      </TranslationsProvider>
    )
  }
}

/** Classes that create a clipping box — an ancestor carrying one of these
 *  silently swallows a descendant's ::before hit area. */
const CLIPPING = ['truncate', 'overflow-hidden', 'overflow-clip']

function clippingAncestorsBetween(inner: Element, outer: Element): string[] {
  const found: string[] = []
  let node: Element | null = inner
  while (node) {
    const cls = node.getAttribute('class') ?? ''
    for (const c of CLIPPING) {
      if (cls.split(/\s+/).includes(c)) found.push(`${node.tagName.toLowerCase()}.${c}`)
    }
    if (node === outer) break
    node = node.parentElement
  }
  return found
}

const GROUPS = [
  {
    label: 'PROTECTION',
    items: [
      { id: 'a1', type: 'insurance' as const, name: '南山醫療終身險' },
      { id: 'a2', type: 'insurance' as const, name: '富邦意外險' },
    ],
  },
]

describe('asset switcher inside the page h1 (#1249)', () => {
  it('lets the asset name be the heading name — an aria-label here would replace it', () => {
    render(
      <AibutsuHeader
        kind="insurance"
        name={
          <AssetSwitcher currentAssetId="a1" groups={GROUPS}>
            <span>南山醫療終身險</span>
          </AssetSwitcher>
        }
      />,
      { wrapper: wrap(en, 'en') },
    )

    const h1 = screen.getByRole('heading', { level: 1 })
    // The heading's accessible name must contain the asset name. Before #1249
    // it was exactly "Switch aibutsu" — the switcher's aria-label won.
    expect(h1.textContent).toContain('南山醫療終身險')
    expect(h1).toHaveAccessibleName(expect.stringContaining('南山醫療終身險') as unknown as string)

    // The trigger keeps its affordance, but through role + haspopup + an
    // sr-only suffix rather than an overriding aria-label.
    const trigger = screen.getByRole('button', { expanded: false })
    expect(trigger.getAttribute('aria-label')).toBeNull()
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger).toHaveAccessibleName(expect.stringContaining('南山醫療終身險') as unknown as string)
    expect(trigger).toHaveAccessibleName(
      expect.stringContaining(en.assetDetail.switcherAriaLabel) as unknown as string,
    )
  })

  it('keeps the h1 free of clipping classes so the trigger ::before hit area survives', () => {
    render(
      <AibutsuHeader
        kind="insurance"
        name={
          <AssetSwitcher currentAssetId="a1" groups={GROUPS}>
            <span>南山醫療終身險</span>
          </AssetSwitcher>
        }
      />,
      { wrapper: wrap(en, 'en') },
    )

    const h1 = screen.getByRole('heading', { level: 1 })
    const trigger = screen.getByRole('button', { expanded: false })

    // The ::before is what takes the 30px pill to 44px.
    expect(trigger.getAttribute('class') ?? '').toMatch(/before:-inset-y-\[7px\]/)

    // …and nothing between it and the heading may clip it. `truncate` used to
    // sit on the h1 itself, which is why the expansion never worked.
    expect(clippingAncestorsBetween(trigger, h1)).toEqual([])
  })

  it('still truncates a plain string name — the truncation moved inward, it did not go away', () => {
    render(<AibutsuHeader kind="pet" name="a-very-long-pet-name-that-must-ellipsis" />, {
      wrapper: wrap(en, 'en'),
    })
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.getAttribute('class') ?? '').not.toMatch(/\btruncate\b/)
    expect(h1.querySelector('.truncate')).not.toBeNull()
  })
})

describe('car colour swatches (#1249)', () => {
  const CAR_COLOR_KEYS = [
    'white', 'black', 'silver', 'dark_gray',
    'dark_red', 'dark_blue', 'brown', 'champagne',
  ] as const

  it.each([
    ['en', en],
    ['ja', ja],
    ['zh-TW', zhTW],
  ] as const)('names every swatch in %s instead of reading the stored key', (locale, dict) => {
    render(<CarSheetBody open onClose={() => {}} />, {
      wrapper: wrap(dict as typeof en, locale as 'en' | 'ja' | 'zh-TW'),
    })

    for (const key of CAR_COLOR_KEYS) {
      const name = dict.assetSheet.car.colorNames[key]
      expect(name, `${locale} is missing a name for ${key}`).toBeTruthy()
      // The identifier itself must never be the accessible name.
      expect(name).not.toBe(key)
      expect(screen.getByRole('button', { name })).toBeTruthy()
      expect(screen.queryByRole('button', { name: key })).toBeNull()
    }
  })
})
