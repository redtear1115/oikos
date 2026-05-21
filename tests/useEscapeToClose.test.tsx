import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, renderHook } from '@testing-library/react'
import { useEscapeToClose } from '@/app/(dashboard)/_components/useEscapeToClose'

// Simulate a user pressing the system Back button / browser Back gesture.
function pressBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

describe('useEscapeToClose — Android Back / popstate (#683)', () => {
  let pushSpy: ReturnType<typeof vi.spyOn>
  let backSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    pushSpy = vi.spyOn(window.history, 'pushState')
    // Model the browser: history.back() pops our synthetic entry and emits a
    // popstate echo. The hook expects this echo to balance its self-pop count.
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
  })

  afterEach(() => {
    pushSpy.mockRestore()
    backSpy.mockRestore()
  })

  it('pushes a synthetic same-URL history entry when a sheet opens', () => {
    const { unmount } = renderHook(() => useEscapeToClose(true, () => {}))
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith(null, '')
    unmount()
  })

  it('does not push when the sheet is closed', () => {
    renderHook(() => useEscapeToClose(false, () => {}))
    expect(pushSpy).not.toHaveBeenCalled()
  })

  it('closes the top sheet on Back without popping history again', () => {
    const onClose = vi.fn()
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => useEscapeToClose(open, onClose),
      { initialProps: { open: true } },
    )

    pressBack()
    expect(onClose).toHaveBeenCalledTimes(1)
    // Back already consumed the synthetic entry — cleanup must not call back().
    rerender({ open: false })
    expect(backSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('unwinds the synthetic entry when closed by other means (X / backdrop / Esc)', () => {
    const { rerender, unmount } = renderHook(
      ({ open }: { open: boolean }) => useEscapeToClose(open, () => {}),
      { initialProps: { open: true } },
    )

    rerender({ open: false })
    expect(backSpy).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not unwind history on a key-change remount while still open (#723)', () => {
    function Body() {
      useEscapeToClose(true, () => {})
      return null
    }
    // Mounted under key "pet" — pushes one synthetic entry.
    const { rerender, unmount } = render(<Body key="pet" />)
    expect(pushSpy).toHaveBeenCalledTimes(1)

    // TypePicker switches type → the keyed body unmounts and a fresh instance
    // mounts, both while open. The unmount must NOT call history.back(): doing
    // so races the new mount's pushState and drops a history entry, which is
    // what let a later Back navigate away instead of closing the sheet.
    rerender(<Body key="house" />)
    expect(backSpy).not.toHaveBeenCalled()
    // The new instance pushed its own fresh synthetic entry.
    expect(pushSpy).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('unwinds exactly one layer per Back when sheets are stacked', () => {
    const onCloseA = vi.fn()
    const onCloseB = vi.fn()

    function Nested({ openA, openB }: { openA: boolean; openB: boolean }) {
      useEscapeToClose(openA, onCloseA) // parent — pushed first
      useEscapeToClose(openB, onCloseB) // child — pushed on top
      return null
    }

    const { rerender, unmount } = render(<Nested openA openB />)
    expect(pushSpy).toHaveBeenCalledTimes(2)

    // First Back closes only the child.
    pressBack()
    expect(onCloseB).toHaveBeenCalledTimes(1)
    expect(onCloseA).not.toHaveBeenCalled()
    rerender(<Nested openA openB={false} />)

    // Second Back closes the parent.
    pressBack()
    expect(onCloseA).toHaveBeenCalledTimes(1)
    rerender(<Nested openA={false} openB={false} />)

    // Both were closed via Back, so neither cleanup popped history.
    expect(backSpy).not.toHaveBeenCalled()
    unmount()
  })

  it('ignores Back when no sheet is open', () => {
    const onClose = vi.fn()
    const { unmount } = renderHook(
      ({ open }: { open: boolean }) => useEscapeToClose(open, onClose),
      { initialProps: { open: false } },
    )
    pressBack()
    expect(onClose).not.toHaveBeenCalled()
    unmount()
  })
})
