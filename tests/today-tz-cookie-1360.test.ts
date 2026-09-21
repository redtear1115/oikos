// #1360 — the `tz` cookie and "today in a zone". See lib/today.ts.

import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  readTimeZoneCookie,
  syncTimeZoneCookie,
  todayYMDIn,
} from '@/lib/today'

const originalTZ = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTZ
  document.cookie = 'tz=; path=/; max-age=0'
})

describe('todayYMDIn', () => {
  const instant = new Date('2026-09-20T23:30:00Z')

  it('formats the calendar day in the given zone, not the runtime zone', () => {
    process.env.TZ = 'UTC'
    expect(todayYMDIn('Asia/Taipei', instant)).toBe('2026-09-21')
    expect(todayYMDIn('UTC', instant)).toBe('2026-09-20')
    expect(todayYMDIn('America/Los_Angeles', instant)).toBe('2026-09-20')
  })
})

describe('isValidTimeZone', () => {
  it('accepts IANA zones Intl knows', () => {
    expect(isValidTimeZone('Asia/Taipei')).toBe(true)
    expect(isValidTimeZone('Europe/London')).toBe(true)
    expect(isValidTimeZone(DEFAULT_TIME_ZONE)).toBe(true)
  })

  it('rejects missing, unknown, and junk values — those fall back to Asia/Taipei', () => {
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone("'; DROP TABLE x; --")).toBe(false)
    expect(isValidTimeZone('A'.repeat(65))).toBe(false)
  })
})

describe('tz cookie', () => {
  it('reads the value out of a cookie string', () => {
    expect(readTimeZoneCookie('lang=en; tz=Asia%2FTokyo; x=1')).toBe('Asia/Tokyo')
    expect(readTimeZoneCookie('lang=en')).toBeNull()
  })

  it('writes the device zone when the cookie is missing, and not again when it matches', () => {
    process.env.TZ = 'Asia/Tokyo'
    expect(syncTimeZoneCookie()).toBe(true)
    expect(readTimeZoneCookie(document.cookie)).toBe('Asia/Tokyo')
    expect(syncTimeZoneCookie()).toBe(false)
  })

  it('rewrites it after the device moves zones', () => {
    process.env.TZ = 'Asia/Tokyo'
    syncTimeZoneCookie()
    process.env.TZ = 'Europe/Paris'
    expect(syncTimeZoneCookie()).toBe(true)
    expect(readTimeZoneCookie(document.cookie)).toBe('Europe/Paris')
  })
})
