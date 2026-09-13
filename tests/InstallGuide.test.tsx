import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstallGuide } from '@/app/(dashboard)/_components/InstallGuide'
import { track } from '@/lib/analytics/track'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

// InstallGuide receives t as a prop and must NOT call useTranslations() internally.
// Rendering without TranslationsProvider is the regression guard for the setup 500
// (Error: useTranslations must be used inside <TranslationsProvider>).

beforeEach(() => {
  vi.mocked(track).mockClear()
})

describe('InstallGuide', () => {
  it('renders without TranslationsProvider — regression for setup 500', () => {
    // No I18nWrapper: if the component still calls useTranslations() this throws.
    expect(() =>
      render(<InstallGuide open={false} onClose={() => {}} t={zhTW} source="setup" />)
    ).not.toThrow()
  })

  it('shows title and close button when open', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    expect(screen.getByText(zhTW.installGuide.title)).toBeTruthy()
    expect(screen.getByText(zhTW.installGuide.close)).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<InstallGuide open={true} onClose={onClose} t={zhTW} source="setup" />)
    fireEvent.click(screen.getByText(zhTW.installGuide.close))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

/**
 * #1126 — the sheet interrupts the activation window and nothing measured it.
 * These lock the two properties that make the numbers readable at all: that an
 * impression means "opened" and not "the page that owns this rendered", and
 * that the automatic and user-initiated entry points stay separable.
 */
describe('InstallGuide telemetry (#1126)', () => {
  it('does not count a closed sheet as an impression', () => {
    // The component stays mounted-and-closed for the life of the page, so an
    // on-mount track() would turn every /setup and /settings load into one.
    render(<InstallGuide open={false} onClose={() => {}} t={zhTW} source="setup" />)
    expect(track).not.toHaveBeenCalled()
  })

  it('fires install_guide_shown when the sheet actually opens', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    expect(track).toHaveBeenCalledWith(
      'install_guide_shown',
      expect.objectContaining({ source: 'setup' }),
    )
  })

  it('fires on the closed→open transition, not on every render', () => {
    const { rerender } = render(
      <InstallGuide open={false} onClose={() => {}} t={zhTW} source="setup" />
    )
    expect(track).not.toHaveBeenCalled()

    rerender(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    const shownCalls = () =>
      vi.mocked(track).mock.calls.filter(([event]) => event === 'install_guide_shown')
    expect(shownCalls()).toHaveLength(1)

    // A re-render with `open` unchanged must not add a second impression.
    rerender(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    expect(shownCalls()).toHaveLength(1)
  })

  it('keeps the two entry points separable', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="settings" />)
    expect(track).toHaveBeenCalledWith(
      'install_guide_shown',
      expect.objectContaining({ source: 'settings' }),
    )
  })

  it('fires install_guide_dismissed on the close button', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    fireEvent.click(screen.getByText(zhTW.installGuide.close))
    expect(track).toHaveBeenCalledWith(
      'install_guide_dismissed',
      expect.objectContaining({ source: 'setup' }),
    )
  })

  it('reports the detected platform alongside each event', () => {
    render(<InstallGuide open={true} onClose={() => {}} t={zhTW} source="setup" />)
    const [, props] = vi.mocked(track).mock.calls.find(
      ([event]) => event === 'install_guide_shown',
    )!
    // jsdom's UA resolves to one of the Platform values; the assertion is that
    // the dimension is present, not which branch jsdom happens to take.
    expect(props).toHaveProperty('install_platform')
    expect(typeof (props as Record<string, unknown>).install_platform).toBe('string')
  })
})
