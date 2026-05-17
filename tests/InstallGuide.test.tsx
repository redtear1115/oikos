import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// InstallGuide receives t as a prop and must NOT call useTranslations() internally.
// Rendering without TranslationsProvider is the regression guard for the setup 500
// (Error: useTranslations must be used inside <TranslationsProvider>).

describe('InstallGuide', () => {
  it('renders without TranslationsProvider — regression for setup 500', () => {
    // No I18nWrapper: if the component still calls useTranslations() this throws.
    expect(() =>
      render(<InstallGuide open={false} onClose={() => {}} t={zhTW} />)
    ).not.toThrow()
  })

  it('shows title and close button when open', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} />)
    expect(screen.getByText(zhTW.installGuide.title)).toBeTruthy()
    expect(screen.getByText(zhTW.installGuide.close)).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<InstallGuide open={true} onClose={onClose} t={zhTW} />)
    fireEvent.click(screen.getByText(zhTW.installGuide.close))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
