import { describe, it, expect, beforeEach } from 'vitest'
import {
  UI_PREF_COOKIE,
  statsCollapsedCookieName,
  parseBoolCookie,
  writeBoolCookie,
} from '@/lib/uiPrefsCookie'

describe('parseBoolCookie', () => {
  it('parses "1" as true and "0" as false regardless of the default', () => {
    expect(parseBoolCookie('1', false)).toBe(true)
    expect(parseBoolCookie('0', true)).toBe(false)
  })

  it('falls back to the default for undefined or unrecognized values', () => {
    expect(parseBoolCookie(undefined, true)).toBe(true)
    expect(parseBoolCookie(undefined, false)).toBe(false)
    expect(parseBoolCookie('true', false)).toBe(false)
    expect(parseBoolCookie('', true)).toBe(true)
  })
})

describe('statsCollapsedCookieName', () => {
  it('scopes the cookie name per user', () => {
    expect(statsCollapsedCookieName('u-123')).toBe('oikos_stats_collapsed_u-123')
  })
})

describe('writeBoolCookie + parseBoolCookie round-trip', () => {
  beforeEach(() => {
    document.cookie = `${UI_PREF_COOKIE.heroCollapsed}=; max-age=0; path=/`
  })

  it('writes "1"/"0" under the given name, readable back as the same boolean', () => {
    writeBoolCookie(UI_PREF_COOKIE.heroCollapsed, true)
    expect(document.cookie).toContain(`${UI_PREF_COOKIE.heroCollapsed}=1`)

    writeBoolCookie(UI_PREF_COOKIE.heroCollapsed, false)
    expect(document.cookie).toContain(`${UI_PREF_COOKIE.heroCollapsed}=0`)
    // Server-side read of the just-written value resolves back to false.
    expect(parseBoolCookie('0', true)).toBe(false)
  })
})
