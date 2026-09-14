import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PhilosophyCards from '@/app/onboarding/PhilosophyCards'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

// Stable across renders, like the real App Router instance — PhilosophyCards
// re-runs its localStorage check whenever `router` changes identity.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn()
  return { push, router: { push, replace: vi.fn() } }
})
vi.mock('next/navigation', () => ({
  useRouter: () => router,
}))

beforeEach(() => {
  localStorage.clear()
  push.mockClear()
})

describe('PhilosophyCards (#1163 / #1165)', () => {
  it('renders the locale it is given, with an h1 and a per-card h2', () => {
    render(<PhilosophyCards copy={en.onboarding} />)
    expect(screen.getByRole('heading', { level: 1, name: en.onboarding.heading })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Futari won’t ask')
    expect(screen.queryByText(/誰花得比較多/)).not.toBeInTheDocument()
  })

  it('keeps the decorative › out of the skip button name', () => {
    render(<PhilosophyCards copy={en.onboarding} />)
    const skip = screen.getByRole('button', { name: 'Skip' })
    expect(skip).toBeInTheDocument()
  })

  it('moves focus to the new heading and announces progress when a card changes', () => {
    render(<PhilosophyCards copy={en.onboarding} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('What comes into Futari')
    expect(document.activeElement).toBe(heading)
    expect(screen.getByText('Card 2 of 5')).toHaveAttribute('aria-live', 'polite')
  })

  it('renders *emphasis* as <em> without the asterisks', () => {
    render(<PhilosophyCards copy={zhTW.onboarding} />)
    fireEvent.click(screen.getByRole('button', { name: '繼續' }))
    const em = screen.getByRole('heading', { level: 2 }).querySelector('em')
    expect(em).toHaveTextContent('共同的')
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toContain('*')
  })

  it('uses the start label on the last card and leaves for /setup', () => {
    render(<PhilosophyCards copy={ja.onboarding} />)
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: ja.onboarding.next }))
    fireEvent.click(screen.getByRole('button', { name: ja.onboarding.start }))
    expect(push).toHaveBeenCalledWith('/setup')
  })
})

describe('onboarding copy discipline', () => {
  const locales = { 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja }

  it.each(Object.entries(locales))('%s has no exclamation marks or banned words', (_, t) => {
    const all = JSON.stringify(t.onboarding)
    expect(all).not.toMatch(/[!！]/)
    expect(all).not.toMatch(/管理|追蹤|追踪|監控|监控/)
  })

  it.each(Object.entries(locales))('%s has balanced *emphasis* markers', (_, t) => {
    for (const card of t.onboarding.cards) {
      for (const line of card.quote) {
        expect((line.match(/\*/g) ?? []).length % 2).toBe(0)
      }
    }
  })
})
