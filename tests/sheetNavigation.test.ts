import { describe, it, expect, vi } from 'vitest'
import { runAfterSheetCloseBack } from '@/lib/sheetNavigation'

describe('runAfterSheetCloseBack', () => {
  it('does NOT run fn synchronously — only after a popstate', () => {
    const fn = vi.fn()
    runAfterSheetCloseBack(fn)
    // Critical to the fix: the navigation must not fire before the sheet's
    // synthetic history.back() (which surfaces as a popstate) has landed,
    // otherwise the back reverts it (the records filter-apply bug, #745/#752).
    expect(fn).not.toHaveBeenCalled()

    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('runs fn exactly once even if more popstate events fire', () => {
    const fn = vi.fn()
    runAfterSheetCloseBack(fn)
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('isolates listeners — two pending navigations each fire their own fn', () => {
    const a = vi.fn()
    const b = vi.fn()
    runAfterSheetCloseBack(a)
    runAfterSheetCloseBack(b)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })
})
