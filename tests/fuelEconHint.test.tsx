// #1097 — the 平均油耗 subtitle on the asset detail page had three branches for
// four situations, so a car with five fill-ups that had simply been parked for
// half a year was told 「需要至少 2 次加油記錄」 while those five rows sat listed
// further down the same page.
//
// Two layers are covered here on purpose:
//   1. `avgEconHint` — which of the four situations a given input is.
//   2. `AssetHero` rendering — that each situation actually reaches its own
//      string. A correct hint wired to the wrong key would pass layer 1 alone.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { avgEconHint } from '@/lib/fuelEconHint'
import { SIX_MONTHS_DAYS, computeAvgEcon } from '@/lib/fuelEcon'
import { AssetHero } from '@/app/(dashboard)/assets/[id]/_components/AssetHero'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { I18nWrapper } from './_mocks/i18n'

const NOW = new Date('2026-09-13T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY)

describe('avgEconHint — the four situations', () => {
  it('no logs at all → noLog', () => {
    expect(avgEconHint(null, null, NOW)).toBe('noLog')
  })

  it('logs exist but all fall outside the 180-day window → stale', () => {
    // The regression case: 5 fill-ups, newest one 200 days old.
    expect(avgEconHint(null, daysAgo(200), NOW)).toBe('stale')
  })

  it('a log inside the window but not enough to pair → needMore', () => {
    expect(avgEconHint(null, daysAgo(10), NOW)).toBe('needMore')
  })

  it('an average was computed → recent', () => {
    expect(avgEconHint(14.2, daysAgo(10), NOW)).toBe('recent')
  })

  it('stale and needMore split exactly on computeAvgEcon’s own cutoff', () => {
    // computeAvgEcon keeps logs with `loggedAt >= cutoff`, so the log sitting
    // exactly on the boundary must still count as in-window here.
    expect(avgEconHint(null, daysAgo(SIX_MONTHS_DAYS), NOW)).toBe('needMore')
    expect(avgEconHint(null, daysAgo(SIX_MONTHS_DAYS + 1), NOW)).toBe('stale')
  })

  it('a computed average wins even if the clock says stale', () => {
    // avgEcon is computed server-side, `now` here is the client clock. A skewed
    // clock must never contradict a number that was successfully computed.
    expect(avgEconHint(14.2, daysAgo(400), NOW)).toBe('recent')
  })
})

describe('avgEconHint agrees with computeAvgEcon on real log sets', () => {
  const log = (odometer: number, ago: number) => ({
    liters: 30, odometer, loggedAt: daysAgo(ago),
  })

  it('parked car: plenty of history, nothing in the window', () => {
    const logs = [log(80000, 400), log(80450, 360), log(80900, 320), log(81350, 280), log(81800, 200)]
    const avg = computeAvgEcon(logs, NOW)
    expect(avg).toBeNull()  // window is empty, so no pair
    const lastFuelAt = logs.reduce((a, b) => (a.loggedAt >= b.loggedAt ? a : b)).loggedAt
    expect(avgEconHint(avg, lastFuelAt, NOW)).toBe('stale')
  })

  it('new car: exactly one fill-up, inside the window', () => {
    const logs = [log(80000, 5)]
    const avg = computeAvgEcon(logs, NOW)
    expect(avg).toBeNull()
    expect(avgEconHint(avg, logs[0].loggedAt, NOW)).toBe('needMore')
  })
})

describe('AssetHero renders a distinct subtitle per situation', () => {
  const baseProps = {
    brand: 'Toyota',
    model: 'Altis',
    year: 2019,
    fuelType: '95' as const,
    color: null,
    monthAmount: 0,
    totalAmount: 0,
    isPast: false,
  }

  const subtitleFor = (avgEcon: number | null, lastFuelAt: string | null) => {
    const { unmount } = render(
      <I18nWrapper>
        <AssetHero {...baseProps} avgEcon={avgEcon} lastFuelAt={lastFuelAt} />
      </I18nWrapper>,
    )
    const c = zhTW.assetDetail.car
    const found = [c.avgEconNoLog, c.avgEconStale, c.avgEconNeedMore, c.avgEconRecent]
      .filter((s) => screen.queryByText(s) !== null)
    unmount()
    expect(found).toHaveLength(1)
    return found[0]
  }

  it('shows 「加第一筆油看油耗」 when there are no logs', () => {
    expect(subtitleFor(null, null)).toBe(zhTW.assetDetail.car.avgEconNoLog)
  })

  it('shows the stale line — not 「需要至少 2 次加油記錄」 — for a long-parked car', () => {
    // The exact bug in #1097: five logs on the page, none in the window.
    expect(subtitleFor(null, daysAgo(200).toISOString()))
      .toBe(zhTW.assetDetail.car.avgEconStale)
  })

  it('shows 「需要至少 2 次加油記錄」 for a single recent log', () => {
    expect(subtitleFor(null, daysAgo(3).toISOString()))
      .toBe(zhTW.assetDetail.car.avgEconNeedMore)
  })

  it('shows 「近 6 個月」 once an average exists', () => {
    expect(subtitleFor(13.8, daysAgo(3).toISOString()))
      .toBe(zhTW.assetDetail.car.avgEconRecent)
  })
})

describe('avgEconStale copy', () => {
  it('is present in all four locales and distinct from avgEconNeedMore', () => {
    for (const loc of [zhTW, zhCN, en, ja]) {
      const c = loc.assetDetail.car
      expect(c.avgEconStale.length).toBeGreaterThan(0)
      expect(c.avgEconStale).not.toBe(c.avgEconNeedMore)
    }
  })

  it('carries no exclamation mark (banned in UI copy)', () => {
    for (const loc of [zhTW, zhCN, en, ja]) {
      expect(loc.assetDetail.car.avgEconStale).not.toMatch(/[!！]/)
    }
  })
})
