// #1325 — the delete-confirm dialog used to say "確認刪除？" / "這個愛物與所有
// 關聯支出將從列表中移除。" for every aibutsu: no name, and factually wrong
// (softDeleteAsset only sets assets.deletedAt — expenses stay in the ledger).
// The delete button also sat in the sheet body, directly above the primary
// save, in the same thumb sweep.
//
// This test locks down the fix: the confirm dialog interpolates the asset's
// name, uses a softer title for a life-entity type (pet/child/plant) than a
// plain-named one for an item type (car/house/insurance/generic), and the
// delete affordance now lives behind the header "⋯" menu instead of in the
// sheet body.

import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
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
  createPet: vi.fn(),
  editPet: vi.fn(),
  softDeleteAsset: vi.fn(),
}))

import { CarSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/CarSheetBody'
import { PetSheetBody } from '@/app/(dashboard)/assets/_components/AssetSheet/PetSheetBody'

function wrap({ children }: { children: ReactNode }) {
  return (
    <TranslationsProvider value={zhTW} locale="zh-TW">
      {children}
    </TranslationsProvider>
  )
}

function openMenuAndClickDelete() {
  const menuButton = screen.getByRole('button', { name: zhTW.assetSheet.menu.ariaLabel })
  fireEvent.click(menuButton)
  const menu = screen.getByRole('menu')
  fireEvent.click(within(menu).getByRole('menuitem', { name: zhTW.common.delete }))
}

describe('asset delete confirm (#1325)', () => {
  it('moves the delete entry point out of the sheet body and into the header ⋯ menu', () => {
    render(
      <CarSheetBody
        open
        onClose={() => {}}
        initial={{ id: 'a1', name: '小白' }}
      />,
      { wrapper: wrap },
    )

    // No stray "刪除" affordance sitting loose in the sheet body/DOM before
    // the menu is opened — the only way to reach it is through the menu.
    expect(screen.queryByRole('button', { name: zhTW.common.delete })).toBeNull()
    expect(screen.getByRole('button', { name: zhTW.assetSheet.menu.ariaLabel })).toBeTruthy()
  })

  it('interpolates the asset name and uses the plain item title for a car', () => {
    render(
      <CarSheetBody
        open
        onClose={() => {}}
        initial={{ id: 'a1', name: '小白' }}
      />,
      { wrapper: wrap },
    )

    openMenuAndClickDelete()

    const expectedTitle = zhTW.assetSheet.deleteConfirm.item.title.replace('{name}', '小白')
    const expectedDescription = zhTW.assetSheet.deleteConfirm.description.replace('{name}', '小白')
    expect(screen.getByText(expectedTitle)).toBeTruthy()
    expect(screen.getByText(expectedDescription)).toBeTruthy()

    // Truthful: expenses staying in the ledger, not being removed.
    expect(expectedDescription).not.toMatch(/移除|刪除/)
  })

  it('interpolates the asset name and uses the softer life-entity title for a pet', () => {
    render(
      <PetSheetBody
        open
        onClose={() => {}}
        initial={{ id: 'a2', name: '米嚕' }}
      />,
      { wrapper: wrap },
    )

    openMenuAndClickDelete()

    const expectedTitle = zhTW.assetSheet.deleteConfirm.lifeEntity.title.replace('{name}', '米嚕')
    const itemTitle = zhTW.assetSheet.deleteConfirm.item.title.replace('{name}', '米嚕')
    expect(screen.getByText(expectedTitle)).toBeTruthy()
    // And not the plain item copy a car would get.
    expect(screen.queryByText(itemTitle)).toBeNull()
  })
})
