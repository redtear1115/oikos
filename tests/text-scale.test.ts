import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import {
  BODY_BASE_PX, TEXT_SCALE_CAP, TEXT_SCALE_INIT_SCRIPT, TEXT_SCALE_VAR,
  clearTextScale, computeTextScale, syncTextScale,
} from '@/lib/textScale'
import { TextScale } from '@/components/TextScale'

// #1490 — iOS system text size → --text-scale. The probe size is faked here;
// the real measurement (WKWebView following Dynamic Type) was verified in the
// Capacitor shell on a simulator: large 17 → xxxL 23 → AX5 53.

const root = () => document.documentElement
const read = () => root().style.getPropertyValue(TEXT_SCALE_VAR)

/** Make jsdom behave like WKWebView: -apple-system-body is supported and the probe measures `px`. */
function stubCss(supports: (a: string, b?: string) => boolean) {
  vi.stubGlobal('CSS', { supports })
  vi.stubGlobal('window', Object.assign(window, { CSS: { supports } }))
}

function fakeAppleProbe(px: () => number) {
  stubCss((_a, b) => b === '-apple-system-body')
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, p?: string | null) => {
    const cs = real(el, p)
    // jsdom drops the unknown `font: -apple-system-body` shorthand, so recognise the probe by its shape.
    if ((el as HTMLElement).style?.visibility === 'hidden' && el.textContent === 'x') {
      return new Proxy(cs, { get: (t, k) => (k === 'fontSize' ? `${px()}px` : Reflect.get(t, k)) })
    }
    return cs
  })
}

beforeEach(() => root().style.removeProperty(TEXT_SCALE_VAR))
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); root().style.removeProperty(TEXT_SCALE_VAR) })

describe('computeTextScale', () => {
  it('is unset at the default size and below it', () => {
    expect(computeTextScale(BODY_BASE_PX)).toBeNull()
    expect(computeTextScale(14)).toBeNull()
  })
  it('is the ratio to the 17px default', () => {
    expect(computeTextScale(23)).toBeCloseTo(23 / 17, 3)
    expect(computeTextScale(22.1)).toBeCloseTo(1.3, 3)
  })
  it('clamps at the cap (Android parity)', () => {
    expect(TEXT_SCALE_CAP).toBe(2)
    expect(computeTextScale(34)).toBe(2)
    expect(computeTextScale(53)).toBe(2) // AX5 would be 3.1
  })
  it('ignores unmeasurable probes', () => {
    expect(computeTextScale(NaN)).toBeNull()
    expect(computeTextScale(0)).toBeNull()
  })
})

describe('syncTextScale', () => {
  it('sets the var from the probe, and removes the probe element', () => {
    fakeAppleProbe(() => 23)
    expect(syncTextScale()).toBeCloseTo(1.353, 3)
    expect(read()).toBe('1.353')
    expect(document.querySelectorAll('span[aria-hidden]').length).toBe(0)
  })
  it('unsets the var when the size returns to default', () => {
    let px = 23
    fakeAppleProbe(() => px)
    syncTextScale(); expect(read()).not.toBe('')
    px = 17
    syncTextScale(); expect(read()).toBe('')
  })
  it('never sets the var where -apple-system-body is unsupported (Android / Chrome)', () => {
    stubCss(() => false)
    root().style.setProperty(TEXT_SCALE_VAR, '1.5') // stale value must be cleared too
    expect(syncTextScale()).toBeNull()
    expect(read()).toBe('')
  })
})

describe('TEXT_SCALE_INIT_SCRIPT (pre-paint copy) agrees with computeTextScale', () => {
  it.each([12, 17, 19, 21, 23, 28, 34, 53])('probe %ipx', (px) => {
    fakeAppleProbe(() => px)
    new Function(TEXT_SCALE_INIT_SCRIPT)()
    const expected = computeTextScale(px)
    expect(read()).toBe(expected === null ? '' : String(expected))
    root().style.removeProperty(TEXT_SCALE_VAR)
  })
  it('does nothing visible and does not throw where the probe is unsupported', () => {
    stubCss(() => false)
    expect(() => new Function(TEXT_SCALE_INIT_SCRIPT)()).not.toThrow()
    expect(read()).toBe('')
  })
})

describe('<TextScale />', () => {
  it('measures on mount, re-measures on visibilitychange, clears on unmount', () => {
    let px = 23
    fakeAppleProbe(() => px)
    const { unmount } = render(createElement(TextScale))
    expect(read()).toBe('1.353')
    px = 34
    document.dispatchEvent(new Event('visibilitychange'))
    expect(read()).toBe('2')
    unmount()
    expect(read()).toBe('') // sign-out soft-nav keeps <html>; the var must not outlive the dashboard
  })
  it('clearTextScale removes the var', () => {
    root().style.setProperty(TEXT_SCALE_VAR, '1.2')
    clearTextScale()
    expect(read()).toBe('')
  })
})
