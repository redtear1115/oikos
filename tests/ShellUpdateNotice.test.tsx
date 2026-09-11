import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

const isNativePlatform = vi.fn(() => false)
const getPlatform = vi.fn(() => 'web')
const getInfo = vi.fn(async () => ({ name: 'Futari', id: 'dev.southernlight.futari', build: '3', version: '1.5.5' }))
const track = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => isNativePlatform(),
    getPlatform: () => getPlatform(),
  },
}))

vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => getInfo() },
}))

vi.mock('@/lib/analytics/track', () => ({
  track: (...args: unknown[]) => track(...args),
}))

import { ShellUpdateNotice } from '@/app/(dashboard)/_components/ShellUpdateNotice'
import { MIN_SHELL_VERSION } from '@/lib/shellVersion'

const DISMISS_KEY = 'futari_shell_update_dismissed_v1'

/** Put the shell on `version`, below or above the ios threshold as needed. */
function asNativeShell(version: string, platform: 'ios' | 'android' = 'ios') {
  isNativePlatform.mockReturnValue(true)
  getPlatform.mockReturnValue(platform)
  getInfo.mockResolvedValue({
    name: 'Futari',
    id: 'dev.southernlight.futari',
    build: '3',
    version,
  })
}

beforeEach(() => {
  localStorage.clear()
  isNativePlatform.mockReturnValue(false)
  getPlatform.mockReturnValue('web')
  track.mockClear()
  getInfo.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ShellUpdateNotice — web / PWA context', () => {
  it('renders nothing and never reads the shell version', async () => {
    const { container } = render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    // The acceptance bar for #991: a browser visitor must not even touch the
    // Capacitor App plugin, let alone see a notice.
    expect(getInfo).not.toHaveBeenCalled()
    expect(track).not.toHaveBeenCalled()
  })
})

describe('ShellUpdateNotice — native shell', () => {
  it('stays silent when the shell meets the threshold', async () => {
    asNativeShell('1.5.5')
    const { container } = render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    await waitFor(() => expect(track).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a dismissible notice when the shell is below the threshold', async () => {
    asNativeShell('1.0.0')
    render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent(zhTW.shellUpdateNotice.message)
    expect(screen.getByRole('button', { name: zhTW.shellUpdateNotice.dismissAriaLabel })).toBeInTheDocument()
  })

  it('remembers the dismissal against the threshold that was dismissed', async () => {
    asNativeShell('1.0.0')
    render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    const button = await screen.findByRole('button')
    button.click()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(localStorage.getItem(DISMISS_KEY)).toBe(MIN_SHELL_VERSION.ios)
  })

  it('does not re-show a notice already dismissed at this threshold', async () => {
    localStorage.setItem(DISMISS_KEY, MIN_SHELL_VERSION.ios)
    asNativeShell('1.0.0')
    const { container } = render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    await waitFor(() => expect(track).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('re-shows after the threshold is raised past the dismissed value', async () => {
    // Someone dismissed back when the bar was 1.0.0; the bar has since moved.
    localStorage.setItem(DISMISS_KEY, '1.0.0')
    asNativeShell('1.0.0')
    render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('reports the shell version to analytics on every open', async () => {
    asNativeShell('1.0.0')
    render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1))
    expect(track).toHaveBeenCalledWith('shell_version_seen', {
      shell_platform: 'ios',
      shell_version: '1.0.0',
      shell_build: '3',
      shell_min_version: MIN_SHELL_VERSION.ios,
      shell_outdated: true,
    })
  })

  it('stays silent when getInfo rejects', async () => {
    isNativePlatform.mockReturnValue(true)
    getPlatform.mockReturnValue('android')
    getInfo.mockRejectedValue(new Error('plugin not implemented'))
    const { container } = render(<ShellUpdateNotice />, { wrapper: I18nWrapper })
    await waitFor(() => expect(getInfo).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(track).not.toHaveBeenCalled()
  })
})
