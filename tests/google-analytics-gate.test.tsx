import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

/**
 * #1558 — gtag.js has no beforeSend hook, so the outing share link
 * (`/<locale>/outing/<shareToken>`) must not load GA at all, and a client
 * navigation onto it after GA loaded must flip Google's `ga-disable-<id>`
 * opt-out. The other direction is checked too: every other path, including
 * the signed-in `/outings/<uuid>`, still gets GA (Ko-fi attribution).
 */

const GA_ID = 'G-TEST123'
const TOKEN = 'ZZ_TOKEN_ZZ'
const UUID = '2b1f6a1e-6c1d-4f8e-9a3c-0d5e7f8a9b10'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('@next/third-parties/google', () => ({
  GoogleAnalytics: ({ gaId }: { gaId: string }) => (
    <>
      <span data-testid="ga-init" id="_next-ga-init" />
      <span data-testid="ga-src" data-src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
    </>
  ),
}))

const flag = () => (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]
})
afterEach(cleanup)

describe('isOutingSharePath', () => {
  it.each<[string | null, boolean]>([
    [`/outing/${TOKEN}`, true],
    [`/en/outing/${TOKEN}`, true],
    [`/zh-CN/outing/${TOKEN}/join`, true],
    [`/en/OUTING/${TOKEN}`, true],
    ['/en/outing', false],
    ['/en/outing/', false],
    [`/outings/${UUID}`, false],
    ['/', false],
    ['/en', false],
    [`/records/outing/${TOKEN}/x`, true],
    [null, false],
  ])('%s → %s', async (path, expected) => {
    const { isOutingSharePath } = await import('@/app/google-analytics')
    expect(isOutingSharePath(path)).toBe(expected)
  })
})

describe('GoogleAnalyticsGate', () => {
  it('renders no GA script in the server HTML of an outing share link', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    for (const path of [`/en/outing/${TOKEN}`, `/outing/${TOKEN}`]) {
      pathname = path
      const html = renderToString(<GoogleAnalyticsGate gaId={GA_ID} />)
      expect(html).not.toContain('googletagmanager')
      expect(html).not.toContain('_next-ga-init')
    }
  })

  it('renders GA everywhere else, including the signed-in /outings/<uuid>', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    for (const path of ['/', '/en', '/dashboard', `/outings/${UUID}`]) {
      pathname = path
      const html = renderToString(<GoogleAnalyticsGate gaId={GA_ID} />)
      expect(html).toContain(`googletagmanager.com/gtag/js?id=${GA_ID}`)
    }
  })

  it('disables hits while on an outing path after GA has loaded, and re-enables after', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    pathname = '/en'
    const view = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).not.toBeNull()
    expect(flag()).toBe(false)

    pathname = `/en/outing/${TOKEN}`
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(true)
    // gtag cannot be unloaded; the scripts stay mounted rather than re-running config.
    expect(view.queryByTestId('ga-src')).not.toBeNull()

    pathname = `/outings/${UUID}`
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(false)
  })

  it('loads GA only once the user leaves the outing link they landed on', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    pathname = `/en/outing/${TOKEN}`
    const view = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).toBeNull()
    expect(flag()).toBe(true)

    pathname = '/en/sign-in'
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).not.toBeNull()
    expect(flag()).toBe(false)
  })
})
