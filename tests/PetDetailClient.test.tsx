// PR #6: notes section visibility on the asset detail page.
//
// PetDetailClient pulls in a deep tree (BottomNav, TransactionFeed, AssetSheet,
// AddSheet, …) — too much for a focused notes-rendering test. We mock the heavy
// children so this test only asserts the notes branch in the parent component.

import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/_components/BottomNav', () => ({ BottomNav: () => null }))
vi.mock('@/app/(dashboard)/_components/TransactionFeed', () => ({ TransactionFeed: () => null }))
vi.mock('@/app/(dashboard)/dashboard/_components/AddSheet', () => ({ AddSheet: () => null }))
vi.mock('@/app/(dashboard)/assets/_components/AssetSheet', () => ({ AssetSheet: () => null }))
vi.mock('@/actions/transaction', () => ({ loadMoreTransactionsForAsset: vi.fn() }))
vi.mock('../app/(dashboard)/assets/[id]/_components/AibutsuHeader', () => ({
  AibutsuHeader: () => null,
  useTint: () => ({ accent: '#000', bg: '#fff' }),
}))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHeader', () => ({
  AibutsuHeader: () => null,
  useTint: () => ({ accent: '#000', bg: '#fff' }),
}))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AssetSwitcher', () => ({
  AssetSwitcher: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/app/(dashboard)/assets/[id]/_components/AibutsuHintCard', () => ({ AibutsuHintCard: () => null }))

import { render, screen } from '@testing-library/react'
import { PetDetailClient } from '@/app/(dashboard)/assets/[id]/_components/PetDetailClient'
import { I18nWrapper } from './_mocks/i18n'

const baseProps = {
  assetId: 'a1',
  name: '米嚕',
  details: null,
  summary: { monthAmount: 0, totalAmount: 0 },
  assetSheetInitial: { id: 'a1', type: 'pet' as const, name: '米嚕' },
  initialTxns: [],
  pageSize: 20,
  allAssets: [],
}

describe('PetDetailClient — notes section', () => {
  it('hides the notes section when notes is null', () => {
    render(<PetDetailClient {...baseProps} notes={null} />, { wrapper: I18nWrapper })
    expect(screen.queryByText('備註')).not.toBeInTheDocument()
  })

  it('renders the notes section with whitespace-pre-wrap when notes is present', () => {
    const noteText = '上次健檢一切正常\n下次回診 6/12'
    const { container } = render(<PetDetailClient {...baseProps} notes={noteText} />, { wrapper: I18nWrapper })
    expect(screen.getByText('備註')).toBeInTheDocument()
    // The notes text lives inside a div with whitespace-pre-wrap so the
    // browser preserves the literal '\n' visually as a line break.
    const noteDiv = container.querySelector('.whitespace-pre-wrap')
    expect(noteDiv).not.toBeNull()
    expect(noteDiv!.textContent).toBe(noteText)
  })
})
