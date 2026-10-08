import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

/**
 * #1558 / #1583 — gtag.js has no beforeSend hook, so a URL that carries a
 * bearer token (outing share link, invite, or a sign-in bounce whose `next` is
 * one of those) must not load GA at all, and a client navigation onto one
 * after GA loaded must flip Google's `ga-disable-<id>` opt-out — and keep it
 * set until the next full load (sticky). The other direction is checked too:
 * every other URL, including the signed-in `/outings/<uuid>` and plain
 * `/sign-in`, still gets GA (Ko-fi attribution).
 */

const GA_ID = 'G-TEST123'
const TOKEN = 'ZZ_TOKEN_ZZ'
const UUID = '2b1f6a1e-6c1d-4f8e-9a3c-0d5e7f8a9b10'

let pathname = '/'
let search = ''
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}))
/** Point the mocked router at `url` (path + optional query). */
function go(url: string) {
  const i = url.indexOf('?')
  pathname = i === -1 ? url : url.slice(0, i)
  search = i === -1 ? '' : url.slice(i + 1)
}
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
  go('/')
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

  it('disables hits on an outing path after GA has loaded, and keeps them off until a full load', async () => {
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

    // Sticky (#1583 F3): gtag saw the token URL, so it stays off until a full load.
    pathname = `/outings/${UUID}`
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(true)
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

  it('renders no GA script in the server HTML of an invite or a token-bearing sign-in bounce', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    for (const url of BLOCKED) {
      go(url)
      const html = renderToString(<GoogleAnalyticsGate gaId={GA_ID} />)
      expect(html, url).not.toContain('googletagmanager')
      expect(html, url).not.toContain('_next-ga-init')
    }
  })

  it('renders GA on normal traffic, including landing and plain sign-in', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    for (const url of NOT_BLOCKED) {
      go(url)
      const html = renderToString(<GoogleAnalyticsGate gaId={GA_ID} />)
      expect(html, url).toContain(`googletagmanager.com/gtag/js?id=${GA_ID}`)
    }
  })

  it('soft navigation decides on the new search params, and the block is sticky', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    go('/')
    const view = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).not.toBeNull()
    expect(flag()).toBe(false)

    // Same pathname family, only the query makes it token-bearing.
    go(`/sign-in?next=/invite/${TOKEN}`)
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(true)
    expect(view.queryByTestId('ga-src')).not.toBeNull()

    go('/')
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(true)
    view.unmount()

    // A fresh mount (= next full page load) on `/` renders GA and clears the flag.
    go('/')
    const fresh = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(fresh.queryByTestId('ga-src')).not.toBeNull()
    expect(flag()).toBe(false)
  })

  it('a query change on the same path is enough to block', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    go('/zh-TW/sign-in')
    const view = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(false)
    go(`/zh-TW/sign-in?next=%2Finvite%2F${TOKEN}`)
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(flag()).toBe(true)
  })

  it('landing on the invite bounce loads GA only after leaving it, and not sticky', async () => {
    const { GoogleAnalyticsGate } = await import('@/app/google-analytics')
    go(`/sign-in?next=%2Finvite%2F${TOKEN}&from=invite`)
    const view = render(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).toBeNull()
    expect(flag()).toBe(true)

    go('/terms')
    view.rerender(<GoogleAnalyticsGate gaId={GA_ID} />)
    expect(view.queryByTestId('ga-src')).not.toBeNull()
    expect(flag()).toBe(false)
  })
})

// Rev 2 acceptance lists (#1583). The sign-in forms are as the browser sees
// them: `/sign-in` unprefixed is the default locale.
const BLOCKED = [
  `/invite/${TOKEN}`,
  `/sign-in?next=%2Finvite%2F${TOKEN}&from=invite`,
  `/zh-TW/sign-in?next=/invite/${TOKEN}`,
  `/ja/sign-in?next=/zh-TW/invite/${TOKEN}`,
  `/en/sign-in?next=/outing/${TOKEN}`,
  `/sign-in?next=/en/outing/${TOKEN}`,
  `/sign-in?next=/dashboard&next=/invite/${TOKEN}`, // any `next` value counts
  `/outing/r/${UUID}`, // unchanged: blocked by the existing outing rule
]
const NOT_BLOCKED = [
  '/',
  '/zh-TW',
  '/sign-in',
  '/zh-TW/sign-in',
  '/sign-in?next=/dashboard',
  '/sign-in?next=/settings/invite/x',
  '/sign-in?next=/outings/abc',
  '/sign-in?next=https://evil.example/invite/x',
  '/invite',
  '/invite/',
  `/outings/${UUID}`,
  `/settings/invite/${TOKEN}`,
]

describe('isTokenBearingUrl', () => {
  const split = (url: string): [string, string[]] => {
    const u = new URL(url, 'https://x.test')
    return [u.pathname, u.searchParams.getAll('next')]
  }
  it.each(BLOCKED)('%s → blocked', async (url) => {
    const { isTokenBearingUrl } = await import('@/app/google-analytics')
    expect(isTokenBearingUrl(...split(url))).toBe(true)
  })
  it.each(NOT_BLOCKED)('%s → not blocked', async (url) => {
    const { isTokenBearingUrl } = await import('@/app/google-analytics')
    expect(isTokenBearingUrl(...split(url))).toBe(false)
  })
})
