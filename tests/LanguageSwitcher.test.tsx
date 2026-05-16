import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSwitcher } from '@/lib/i18n/LanguageSwitcher'

// Note on fireEvent vs userEvent: this project doesn't depend on
// @testing-library/user-event, so we use fireEvent. fireEvent.click does NOT
// respect `disabled` attribute (it dispatches regardless), so the
// "click active locale" no-op test passes because of switchLang's
// `if (lang === current) return` guard, not because of `disabled`.

const pushMock = vi.fn()
const refreshMock = vi.fn()
const pathnameRef = { current: '/' }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  usePathname: () => pathnameRef.current,
}))

beforeEach(() => {
  pushMock.mockClear()
  refreshMock.mockClear()
  // Reset cookies between tests
  document.cookie.split(';').forEach((c) => {
    const eq = c.indexOf('=')
    const name = eq > -1 ? c.slice(0, eq).trim() : c.trim()
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })
})

describe('LanguageSwitcher on public pages', () => {
  it('pushes locale-prefixed URL when switching from / to en', () => {
    pathnameRef.current = '/'
    render(<LanguageSwitcher current="zh-TW" variant="footer" />)
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(pushMock).toHaveBeenCalledWith('/en')
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('pushes unprefixed URL when switching from /en/sign-in back to default', () => {
    pathnameRef.current = '/en/sign-in'
    render(<LanguageSwitcher current="en" variant="footer" />)
    fireEvent.click(screen.getByRole('button', { name: '繁中' }))
    expect(pushMock).toHaveBeenCalledWith('/sign-in')
  })

  it('swaps locale prefix when switching between non-default locales on a sub-path', () => {
    pathnameRef.current = '/en/terms'
    render(<LanguageSwitcher current="en" variant="footer" />)
    fireEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(pushMock).toHaveBeenCalledWith('/ja/terms')
  })

  it('does nothing when the user clicks the already-active locale', () => {
    pathnameRef.current = '/'
    render(<LanguageSwitcher current="zh-TW" variant="footer" />)
    const active = screen.getByRole('button', { name: '繁中' })
    expect(active).toBeDisabled()
    fireEvent.click(active)
    expect(pushMock).not.toHaveBeenCalled()
  })
})

describe('LanguageSwitcher on non-public (dashboard) pages', () => {
  it('writes lang cookie and refreshes (no URL push)', () => {
    pathnameRef.current = '/dashboard'
    render(<LanguageSwitcher current="zh-TW" variant="pill" />)
    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(refreshMock).toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    expect(document.cookie).toContain('lang=en')
  })

  it('cookie + refresh works for nested dashboard paths', () => {
    pathnameRef.current = '/assets/some-id'
    render(<LanguageSwitcher current="zh-TW" variant="pill" />)
    fireEvent.click(screen.getByRole('button', { name: '日本語' }))
    expect(refreshMock).toHaveBeenCalled()
    expect(document.cookie).toContain('lang=ja')
  })
})
