// #1360 — client components that render "today"-derived values (an age, a
// day count, 今天/昨天) are server-rendered on Vercel in UTC and hydrated in
// the device's zone. Between 00:00 and 08:00 Taipei the two calendars are a
// day apart, the server HTML disagrees with the first client render, and
// React reports a recoverable hydration error (#418) and re-renders on the
// client.
//
// Failure looks like: nothing wrong on screen (the client's number wins) —
// just #418s in Sentry that only happen in the eight hours after Taipei
// midnight.
//
// These tests reproduce that for real: renderToString with process.env.TZ =
// 'UTC' (the server), then hydrateRoot with TZ = 'Asia/Taipei' (the device),
// at 2026-09-20T23:30Z = 2026-09-21 07:30 Taipei. Node re-reads TZ at
// runtime for both Date and Intl.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { TodayProvider, useToday } from '@/app/(dashboard)/_components/TodayProvider'
import { daysBetween, parseLocalDate, todayLocalDate } from '@/lib/local-date'
import { todayYMDIn } from '@/lib/today'

const INSTANT = new Date('2026-09-20T23:30:00Z') // 2026-09-21 07:30 in Taipei
const START = '2026-09-01'

const originalTZ = process.env.TZ

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(INSTANT)
  document.cookie = 'tz=; path=/; max-age=0'
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = originalTZ
  document.body.innerHTML = ''
})

/** The pre-#1360 shape: reads the runtime clock during render. */
function MainStub() {
  const start = parseLocalDate(START)!
  return <span data-testid="days">{daysBetween(start, todayLocalDate())}</span>
}

/** The #1360 shape: today comes from useToday(). */
function Fixed() {
  const start = parseLocalDate(START)!
  const today = parseLocalDate(useToday())!
  return <span data-testid="days">{daysBetween(start, today)}</span>
}

/**
 * Server-render under `serverTZ` with the provider seeded the way the
 * dashboard layout seeds it (today in the cookie zone), then hydrate under
 * `deviceTZ`. Returns the recoverable errors React reported and the final text.
 */
async function ssrThenHydrate(
  node: ReactNode,
  { serverTZ, deviceTZ, cookieTZ }: { serverTZ: string; deviceTZ: string; cookieTZ: string },
) {
  process.env.TZ = serverTZ
  const tree = <TodayProvider todayYMD={todayYMDIn(cookieTZ)}>{node}</TodayProvider>
  const html = renderToString(tree)
  const serverText = /data-testid="days">(\d+)</.exec(html)?.[1]

  process.env.TZ = deviceTZ
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const errors: unknown[] = []
  await act(async () => {
    hydrateRoot(container, tree, { onRecoverableError: (e) => errors.push(e) })
  })
  const finalText = container.querySelector('[data-testid="days"]')?.textContent
  return { errors, serverText, finalText }
}

describe('hydrating "today" across zones (#1360)', () => {
  it('reproduces the mismatch with the pre-#1360 shape (UTC server → Taipei device)', async () => {
    const r = await ssrThenHydrate(<MainStub />, { serverTZ: 'UTC', deviceTZ: 'Asia/Taipei', cookieTZ: 'Asia/Taipei' })
    expect(r.serverText).toBe('19') // 2026-09-20 in UTC
    expect(r.finalText).toBe('20') // 2026-09-21 in Taipei — what the browser shows
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('zero recoverable errors with useToday(), and the final number is the device\'s', async () => {
    const r = await ssrThenHydrate(<Fixed />, { serverTZ: 'UTC', deviceTZ: 'Asia/Taipei', cookieTZ: 'Asia/Taipei' })
    expect(r.errors).toEqual([])
    expect(r.serverText).toBe('20')
    expect(r.finalText).toBe('20') // identical to what MainStub ends up showing
  })

  it('first visit (no cookie → Asia/Taipei fallback) from a zone a day behind: no error, device value after hydration', async () => {
    // Los Angeles at this instant is 2026-09-20 16:30. The server has no
    // cookie yet and falls back to Taipei (the 21st); hydration uses that,
    // then useToday() re-renders with the device's own day. Honest cost: that
    // re-render can change the number once, on the first visit only.
    const r = await ssrThenHydrate(<Fixed />, { serverTZ: 'UTC', deviceTZ: 'America/Los_Angeles', cookieTZ: 'Asia/Taipei' })
    expect(r.errors).toEqual([])
    expect(r.serverText).toBe('20')
    expect(r.finalText).toBe('19')
  })

  it('mounts with a malformed tz cookie: no uncaught error, cookie rewritten to the device zone', async () => {
    // A sibling site on .southern-light.dev could plausibly leave this. Before
    // the fix, decodeURIComponent threw URIError in TodayProvider's effect and
    // the dashboard fell to the global error page on every load.
    process.env.TZ = 'Asia/Taipei'
    document.cookie = 'tz=%E0%A4%A; path=/'
    const container = document.createElement('div')
    document.body.appendChild(container)
    await expect(
      act(async () => {
        createRoot(container).render(<TodayProvider todayYMD="2026-09-21"><Fixed /></TodayProvider>)
      }),
    ).resolves.not.toThrow()
    expect(container.querySelector('[data-testid="days"]')?.textContent).toBe('20')
    expect(document.cookie).toContain('tz=Asia%2FTaipei')
    expect(document.cookie).not.toContain('%E0%A4%A')
  })

  it('writes the device zone into the tz cookie after hydration', async () => {
    await ssrThenHydrate(<Fixed />, { serverTZ: 'UTC', deviceTZ: 'Asia/Taipei', cookieTZ: 'Asia/Taipei' })
    expect(document.cookie).toContain('tz=Asia%2FTaipei')
  })
})
