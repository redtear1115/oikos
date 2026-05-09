import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { FirstRecordCard } from '@/app/(dashboard)/dashboard/_components/FirstRecordCard'

const wrap = (ui: React.ReactElement) => render(<I18nWrapper>{ui}</I18nWrapper>)

describe('FirstRecordCard', () => {
  it('renders nothing when show is false', () => {
    wrap(<FirstRecordCard show={false} />)
    expect(screen.queryByText(/第一筆/)).toBeNull()
  })

  it('renders headline when show is true', () => {
    wrap(<FirstRecordCard show={true} />)
    expect(screen.getByText(/第一筆/)).toBeInTheDocument()
  })

  it('hides when 明白了 is clicked', () => {
    wrap(<FirstRecordCard show={true} />)
    fireEvent.click(screen.getByRole('button', { name: '明白了' }))
    expect(screen.queryByText(/第一筆/)).toBeNull()
  })

  it('hides when × close is clicked', () => {
    wrap(<FirstRecordCard show={true} />)
    fireEvent.click(screen.getByRole('button', { name: '關閉提示' }))
    expect(screen.queryByText(/第一筆/)).toBeNull()
  })
})
