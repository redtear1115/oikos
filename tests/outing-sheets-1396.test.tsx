import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { AddExpenseSheet } from '@/app/(dashboard)/outings/[id]/_components/AddExpenseSheet'
import { EndOutingSheet } from '@/app/(dashboard)/outings/[id]/_components/EndOutingSheet'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/actions/outing', () => ({ addOutingExpense: vi.fn(), endOuting: vi.fn() }))

/** The split row is the second chip row; the first is the payer. */
function splitChips() {
  const label = screen.getByText('分給誰')
  return within(label.parentElement as HTMLElement).getAllByRole('button')
}

function pressed(name: string) {
  const chip = splitChips().find((b) => b.textContent === name)
  if (!chip) throw new Error(`no split chip ${name}`)
  return chip.getAttribute('aria-pressed')
}

describe('#1396 AddExpenseSheet preselection', () => {
  const two = [{ id: 'p1', displayName: '小明' }, { id: 'p2', displayName: '小美' }]
  const three = [...two, { id: 'p3', displayName: '阿華' }]

  const sheet = (open: boolean, participants: typeof two) => (
    <I18nWrapper>
      <AddExpenseSheet open={open} outingId="o1" currency="TWD" participants={participants} onClose={() => {}} />
    </I18nWrapper>
  )

  it('ticks a participant who joined after the page mounted', () => {
    const { rerender } = render(sheet(false, two))
    rerender(sheet(true, three))
    expect(pressed('阿華')).toBe('true')
    expect(pressed('小明')).toBe('true')
  })

  it('resets to everyone on each open, not only the first', () => {
    const { rerender } = render(sheet(true, two))
    fireEvent.click(splitChips().find((b) => b.textContent === '小美')!)
    expect(pressed('小美')).toBe('false')
    rerender(sheet(false, two))
    rerender(sheet(true, two))
    expect(pressed('小美')).toBe('true')
  })
})

describe('#1396 EndOutingSheet has one commit', () => {
  it('shows only the red end button, no header save', () => {
    render(
      <I18nWrapper>
        <EndOutingSheet open outingId="o1" onClose={() => {}} />
      </I18nWrapper>,
    )
    expect(screen.getByRole('button', { name: '結束出遊' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '儲存' })).toBeNull()
  })
})
