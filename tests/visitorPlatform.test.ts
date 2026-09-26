import { describe, it, expect } from 'vitest'
import { resolveVisitorPlatform, ANDROID_BETA_FORM_URL, type ResolveVisitorPlatformInput } from '@/lib/visitorPlatform'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
// iPadOS 13+ reports as a plain Macintosh UA — only maxTouchPoints tells it
// apart from a real Mac.
const IPAD_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const REAL_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function input(overrides: Partial<ResolveVisitorPlatformInput>): ResolveVisitorPlatformInput {
  return {
    userAgent: WINDOWS_UA,
    maxTouchPoints: 0,
    isCapacitor: false,
    isStandalone: false,
    hasSession: false,
    ...overrides,
  }
}

describe('resolveVisitorPlatform (#1413)', () => {
  it('signed-in always goes to dashboard, regardless of platform', () => {
    expect(resolveVisitorPlatform(input({ hasSession: true, userAgent: IPHONE_UA }))).toBe('dashboard')
    expect(resolveVisitorPlatform(input({ hasSession: true, userAgent: ANDROID_UA }))).toBe('dashboard')
    expect(resolveVisitorPlatform(input({ hasSession: true, isCapacitor: true, userAgent: IPHONE_UA }))).toBe(
      'dashboard',
    )
    expect(resolveVisitorPlatform(input({ hasSession: true, userAgent: WINDOWS_UA }))).toBe('dashboard')
  })

  it('never shows the App Store link inside the Capacitor iOS shell (Apple 3.1.1)', () => {
    expect(resolveVisitorPlatform(input({ isCapacitor: true, userAgent: IPHONE_UA }))).toBe('sign_in')
  })

  it('sign-in inside the Capacitor Android shell too', () => {
    expect(resolveVisitorPlatform(input({ isCapacitor: true, userAgent: ANDROID_UA }))).toBe('sign_in')
  })

  it('sign-in for an installed (standalone) PWA on an iPhone', () => {
    expect(resolveVisitorPlatform(input({ isStandalone: true, userAgent: IPHONE_UA }))).toBe('sign_in')
  })

  it('App Store for iPhone Safari (browser tab, not installed)', () => {
    expect(resolveVisitorPlatform(input({ userAgent: IPHONE_UA }))).toBe('app_store')
  })

  it('App Store for iPad — Macintosh UA disambiguated by touch points', () => {
    expect(resolveVisitorPlatform(input({ userAgent: IPAD_MAC_UA, maxTouchPoints: 5 }))).toBe('app_store')
  })

  it('sign-in for a real Mac (Macintosh UA, no touch points)', () => {
    expect(resolveVisitorPlatform(input({ userAgent: REAL_MAC_UA, maxTouchPoints: 0 }))).toBe('sign_in')
  })

  it('Android Chrome gets the beta signup — when a form URL is configured', () => {
    const target = resolveVisitorPlatform(input({ userAgent: ANDROID_UA }))
    // Guards against shipping with the placeholder empty URL (see the constant's
    // own comment): once a real form URL is set this becomes 'android_beta'.
    expect(target).toBe(ANDROID_BETA_FORM_URL ? 'android_beta' : 'sign_in')
  })

  it('Android falls back to sign-in when the beta form URL is empty (never a dead link)', () => {
    // Exercises the fallback branch directly regardless of the constant's
    // current value, since #1413 requires ANDROID_BETA_FORM_URL to ship empty
    // until the real Google Form URL is filled in.
    expect(ANDROID_BETA_FORM_URL).toBe('')
    expect(resolveVisitorPlatform(input({ userAgent: ANDROID_UA }))).toBe('sign_in')
  })

  it('sign-in for desktop / everything else', () => {
    expect(resolveVisitorPlatform(input({ userAgent: WINDOWS_UA }))).toBe('sign_in')
  })
})
