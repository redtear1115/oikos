// #1347 — two small findings from the v1.5.18 verification rounds.
//
// 1. ConfirmModal could be dismissed (backdrop tap / Escape) while its action
//    was in flight. Both buttons were already disabled, so it took a
//    deliberate backdrop tap — but then the dialog closed and a failure's
//    error message had nowhere to show.
//    Failure looks like: nothing throws; the dialog vanishes mid-action and
//    the error is silently lost.
//
// 2. The plant 陪伴天數 and house 住了幾天 heroes had no future-date guard (the
//    same shape as the birthday before #1339). They clamped to 0, so a date
//    typed in ahead of time read as 「0 天」 on the first screen.
//    Failure looks like: nothing throws and nothing goes negative — just a
//    plausible 0 for something that hasn't started.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { I18nWrapper } from './_mocks/i18n'
import { ConfirmModal } from '@/app/(dashboard)/_components/ConfirmModal'
import { daysSince } from '@/lib/age'

// useEscapeToClose (via SheetBackdrop) takes its History API path in jsdom.
// Model the browser: history.back() emits the popstate echo it expects.
let backSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
})
afterEach(() => {
  backSpy.mockRestore()
})

function backdrop(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.z-sheet-backdrop')
  if (!el) throw new Error('backdrop not rendered')
  return el
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  })
}

function Host({ pending }: { pending: boolean }) {
  const [open, setOpen] = useState(true)
  return (
    <I18nWrapper>
      <ConfirmModal
        open={open}
        title="要續保嗎"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {}}
      >
        <p role="alert">續保失敗</p>
      </ConfirmModal>
    </I18nWrapper>
  )
}

describe('ConfirmModal is not dismissible while pending (#1347)', () => {
  it('a backdrop tap during pending leaves the dialog and its error on screen', () => {
    render(<Host pending />)
    fireEvent.click(backdrop())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('續保失敗')
  })

  it('Escape during pending leaves the dialog open', () => {
    render(<Host pending />)
    pressEscape()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('once pending clears, a backdrop tap closes it as before', () => {
    const { rerender } = render(<Host pending />)
    rerender(<Host pending={false} />)
    fireEvent.click(backdrop())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('not pending: Escape closes it as before', () => {
    render(<Host pending={false} />)
    pressEscape()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('daysSince (#1347)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Local 07:00 — before 08:00, when a UTC-midnight parse of today would
    // still be in the future for UTC+8.
    vi.setSystemTime(new Date(2026, 8, 20, 7, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for a date after today — the hero is skipped, not 「0 天」', () => {
    expect(daysSince('2026-09-21')).toBeNull()
    expect(daysSince('2027-01-01')).toBeNull()
  })

  it('returns 0 on the day itself, in local calendar days', () => {
    expect(daysSince('2026-09-20')).toBe(0)
  })

  it('counts whole local days for past dates', () => {
    expect(daysSince('2026-09-19')).toBe(1)
    expect(daysSince('2025-09-20')).toBe(365)
  })

  it('returns null for a missing or malformed date', () => {
    expect(daysSince(null)).toBeNull()
    expect(daysSince(undefined)).toBeNull()
    expect(daysSince('')).toBeNull()
    expect(daysSince('not-a-date')).toBeNull()
  })
})
