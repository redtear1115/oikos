// #1466 — HouseDetailClient used to receive the whole HouseDetails row,
// ciphertext included (`addressEncrypted`), only to compute
// Boolean(details?.addressEncrypted). The server now sends `hasAddress`.
//
// This test pins the rendered markup for both states (address stored / not
// stored). The snapshot was recorded against the pre-#1466 component fed the
// old row shape, then the component and props changed and the snapshot was
// NOT updated — so a pass here is the "pixel-identical" proof: same DOM, same
// classes, same inline styles, same mask characters.
//
// Failure looks like: nothing visible in the browser if the mask flips; the
// header subtitle (●●●●●●●●) and the 地址 row's reveal toggle silently appear
// for a house with no address, or vanish for one that has it.

import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }) }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({ TransactionFeed: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactionsForAsset: vi.fn() }))
vi.mock('@/actions/asset', () => ({ revealHouseAddress: vi.fn() }))
vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({ useMember: () => ({ isPast: false }) }))

import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { HouseDetailClient } from '@/app/(dashboard)/assets/[id]/_components/HouseDetailClient'
import { TodayProvider } from '@/app/(dashboard)/_components/TodayProvider'
import { I18nWrapper } from './_mocks/i18n'

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nWrapper>
      <TodayProvider todayYMD="2026-09-27">{children}</TodayProvider>
    </I18nWrapper>
  )
}

function renderHouse(hasAddress: boolean) {
  const { container } = render(
    <HouseDetailClient
      assetId="house-1"
      name="我們的家"
      notes="備註"
      details={{ owner: 'both', hasAddress, purchasedAt: '2020-01-01', purchasePrice: 12000000 }}
      summary={{ monthAmount: 1580, totalAmount: 5000 }}
      assetSheetInitial={{ id: 'house-1', type: 'house', name: '我們的家', houseHasAddress: hasAddress }}
      initialTxns={[]}
      pageSize={20}
      siblings={[]}
    />,
    { wrapper: Wrapper },
  )
  return container.innerHTML
}

describe('HouseDetailClient markup is unchanged by #1466', () => {
  it('with a stored address: masked subtitle + reveal row', () => {
    const html = renderHouse(true)
    expect(html).toContain('●●●●●●●●')
    expect(html).toMatchSnapshot()
  })

  it('without a stored address: no subtitle, empty row', () => {
    const html = renderHouse(false)
    expect(html).not.toContain('●●●●●●●●')
    expect(html).toMatchSnapshot()
  })
})
