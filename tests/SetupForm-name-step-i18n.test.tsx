import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'

// #1166 — /setup step 1 used to be hardcoded zh-TW in every locale, and its
// only text input had no accessible name ("edit text, blank").

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/actions/group', () => ({ createGroup: vi.fn() }))
vi.mock('@/actions/invite', () => ({ createInvite: vi.fn() }))
vi.mock('@/lib/share', () => ({ shareInviteLink: vi.fn() }))
vi.mock('@/lib/install-guide', () => ({ isStandalone: () => true }))

import SetupForm from '@/app/setup/SetupForm'
import { createGroup } from '@/actions/group'

const CJK = /[㐀-鿿]/

describe('SetupForm name step (#1166)', () => {
  it('renders the name step in English under the en locale', () => {
    const { container } = render(<SetupForm t={en} />)

    expect(screen.getByRole('heading', { level: 1, name: en.setup.name.heading })).toBeTruthy()
    expect(screen.getByText(en.setup.name.subtitle)).toBeTruthy()
    expect(screen.getByRole('button', { name: en.setup.name.next })).toBeTruthy()
    for (const s of en.setup.name.suggestions) {
      expect(screen.getByRole('button', { name: s })).toBeTruthy()
    }
    // No zh-TW leaking through anywhere on the step.
    expect(container.textContent ?? '').not.toMatch(CJK)
  })

  it('gives the name input an accessible name and description', () => {
    render(<SetupForm t={en} />)

    const input = screen.getByRole('textbox', { name: en.setup.name.heading })
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
    const describedBy = (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(describedBy).toContain(en.setup.name.subtitle)
  })

  it('suggestion chips fill the input', () => {
    render(<SetupForm t={ja} />)

    const first = ja.setup.name.suggestions[0]
    fireEvent.click(screen.getByRole('button', { name: first }))
    expect((screen.getByRole('textbox', { name: ja.setup.name.heading }) as HTMLInputElement).value).toBe(first)
  })

  it('shows the localised failure message, never the raw server error', async () => {
    vi.mocked(createGroup).mockRejectedValue(new Error('伺服器內部錯誤'))
    render(<SetupForm t={en} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Home' } })
    fireEvent.click(screen.getByRole('button', { name: en.setup.name.next }))
    fireEvent.click(await screen.findByText(en.trust.bilateral.inviter.cta))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(en.setup.name.failed)
  })

  it('every locale ships a non-empty set of name suggestions', () => {
    for (const t of [zhTW, zhCN, en, ja]) {
      expect(t.setup.name.suggestions.length).toBeGreaterThan(0)
      for (const s of t.setup.name.suggestions) expect(s.trim()).not.toBe('')
    }
  })
})
