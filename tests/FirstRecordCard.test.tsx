import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'

vi.mock('@/app/(dashboard)/_components/MemberContext', () => ({
  useMember: () => ({ viewer: { id: 'u-1' } }),
}))

import { FirstRecordCard } from '@/app/(dashboard)/dashboard/_components/FirstRecordCard'

const STORAGE_KEY = 'oikos_first_record_card_seen_u-1'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

describe('FirstRecordCard', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders nothing when show is false', () => {
    const onDismiss = vi.fn()
    wrap(<FirstRecordCard show={false} onDismiss={onDismiss} />)
    expect(screen.queryByText(/第一筆/)).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('renders headline and writes seen flag when show is true', () => {
    const onDismiss = vi.fn()
    wrap(<FirstRecordCard show={true} onDismiss={onDismiss} />)
    expect(screen.getByText(/第一筆/)).toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('clears seen flag and calls onDismiss when 明白了 is clicked', () => {
    const onDismiss = vi.fn()
    wrap(<FirstRecordCard show={true} onDismiss={onDismiss} />)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '明白了' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('clears seen flag and calls onDismiss when × close is clicked', () => {
    const onDismiss = vi.fn()
    wrap(<FirstRecordCard show={true} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: '關閉提示' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
