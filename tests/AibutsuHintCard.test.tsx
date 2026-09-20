import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AibutsuHintCard } from '@/app/(dashboard)/assets/[id]/_components/AibutsuHintCard'
import { I18nWrapper } from './_mocks/i18n'

describe('AibutsuHintCard', () => {
  it('renders pet hint items', () => {
    render(<AibutsuHintCard type="pet" onCtaPress={() => {}} />, { wrapper: I18nWrapper })
    expect(screen.getByText(/飼料/)).toBeInTheDocument()
    expect(screen.getByText(/看診/)).toBeInTheDocument()
    expect(screen.getByText(/年度疫苗/)).toBeInTheDocument()
  })

  it('renders child hint items', () => {
    render(<AibutsuHintCard type="child" onCtaPress={() => {}} />, { wrapper: I18nWrapper })
    expect(screen.getByText(/尿布奶粉/)).toBeInTheDocument()
    expect(screen.getByText(/學費/)).toBeInTheDocument()
  })

  it('renders plant hint items', () => {
    render(<AibutsuHintCard type="plant" onCtaPress={() => {}} />, { wrapper: I18nWrapper })
    expect(screen.getByText(/介質/)).toBeInTheDocument()
    expect(screen.getByText(/防蟲/)).toBeInTheDocument()
  })

  it('renders house hint items', () => {
    render(<AibutsuHintCard type="house" onCtaPress={() => {}} />, { wrapper: I18nWrapper })
    expect(screen.getByText(/房貸/)).toBeInTheDocument()
    expect(screen.getByText(/清潔/)).toBeInTheDocument()
  })

  it('calls onCtaPress when button is clicked', () => {
    const onCtaPress = vi.fn()
    render(<AibutsuHintCard type="pet" onCtaPress={onCtaPress} />, { wrapper: I18nWrapper })
    fireEvent.click(screen.getByRole('button', { name: /記第一筆/ }))
    expect(onCtaPress).toHaveBeenCalledTimes(1)
  })

  // #1326 — a past (read-only) chapter has no entry point that can open
  // AddSheet, so the empty-timeline hint must not offer the CTA button.
  it('renders no CTA button when onCtaPress is omitted', () => {
    render(<AibutsuHintCard type="pet" />, { wrapper: I18nWrapper })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
