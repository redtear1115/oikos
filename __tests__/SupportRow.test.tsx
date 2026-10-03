import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/i18n/client', () => ({
  useTranslations: () => ({ support: { buttonText: '請喝杯咖啡' } }),
}))

import { SupportRow } from '@/app/(dashboard)/settings/_components/SupportRow'

function setPlatform(platform?: string) {
  if (platform === undefined) {
    delete (window as { Capacitor?: unknown }).Capacitor
  } else {
    ;(window as { Capacitor?: unknown }).Capacitor = { getPlatform: () => platform }
  }
}

afterEach(() => {
  cleanup()
  setPlatform(undefined)
  delete (window as { gtag?: unknown }).gtag
})

describe('SupportRow (#1516)', () => {
  it('is hidden inside the iOS shell (Apple 3.1.1)', () => {
    setPlatform('ios')
    const { container } = render(<SupportRow />)
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('請喝杯咖啡')).toBeNull()
  })

  it.each([[undefined], ['web'], ['android']])('shows on %s after mount', (platform) => {
    setPlatform(platform)
    render(<SupportRow />)
    expect(screen.getByText('請喝杯咖啡')).toBeTruthy()
  })

  it('links to the Ko-fi page in a new tab', () => {
    render(<SupportRow />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('https://ko-fi.com/ray19841115')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('fires kofi_widget_click with the futari source on click', () => {
    const gtag = vi.fn()
    ;(window as unknown as { gtag: typeof gtag }).gtag = gtag
    render(<SupportRow />)
    fireEvent.click(screen.getByRole('link'))
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'kofi_widget_click', { source: 'futari' })
  })

  it('does not throw on click when gtag is absent', () => {
    render(<SupportRow />)
    expect(() => fireEvent.click(screen.getByRole('link'))).not.toThrow()
  })
})

describe('settings page', () => {
  it('no longer mounts the floating KofiWidget', () => {
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/settings/page.tsx'), 'utf8')
    expect(src).not.toContain('KofiWidget')
  })
})
