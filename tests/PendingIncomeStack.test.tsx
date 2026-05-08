import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PendingRow } from '@/lib/db/queries/recurringIncome'

// Stub the inner card so this test stays focused on stack-level behaviour
// (visible count, expand label, expand toggle). PendingIncomeCard pulls in
// next/navigation + server actions which we don't want to wire up here.
vi.mock('@/app/(dashboard)/dashboard/_components/PendingIncomeCard', () => ({
  PendingIncomeCard: ({ pending }: { pending: PendingRow }) => (
    <div data-testid="card">{pending.id}</div>
  ),
}))

import { PendingIncomeStack } from '@/app/(dashboard)/dashboard/_components/PendingIncomeStack'

function row(id: string): PendingRow {
  return {
    id,
    ruleId: `r-${id}`,
    proposedAmount: 30000,
    proposedDate: '2026-05-01',
    category: 'salary',
    source: null,
    recipientId: 'u-a',
    assetId: null,
  }
}

describe('PendingIncomeStack', () => {
  it('renders nothing when there are no pendings', () => {
    const { container } = render(<PendingIncomeStack pendings={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows all pendings when count is at or below the visible cap (2)', () => {
    render(<PendingIncomeStack pendings={[row('p1'), row('p2')]} />)
    expect(screen.getAllByTestId('card')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /展開全部/ })).toBeNull()
  })

  it('truncates to 2 cards and shows expand label when count > 2', () => {
    render(<PendingIncomeStack pendings={[row('p1'), row('p2'), row('p3'), row('p4'), row('p5')]} />)
    expect(screen.getAllByTestId('card')).toHaveLength(2)
    // 5 total - 2 visible = 3 hidden
    expect(screen.getByRole('button', { name: /展開全部（還有 3 筆）/ })).toBeInTheDocument()
  })

  it('reports 1 hidden when there are exactly 3 pendings', () => {
    render(<PendingIncomeStack pendings={[row('p1'), row('p2'), row('p3')]} />)
    expect(screen.getByRole('button', { name: /展開全部（還有 1 筆）/ })).toBeInTheDocument()
  })

  it('expand button reveals all pendings and switches to 收合', () => {
    render(<PendingIncomeStack pendings={[row('p1'), row('p2'), row('p3'), row('p4')]} />)
    fireEvent.click(screen.getByRole('button', { name: /展開全部/ }))
    expect(screen.getAllByTestId('card')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /收合/ })).toBeInTheDocument()
  })
})
