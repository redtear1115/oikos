import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, act } from '@testing-library/react'
import { TranslationsProvider, useTranslations } from '@/lib/i18n/client'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// Contract: useTranslations() must return a stable reference within the same
// locale. Any React.memo child that takes `t` as a prop relies on this — a new
// `t` object per render would silently nullify those memo boundaries.

describe('useTranslations() reference stability', () => {
  it('returns the same t reference across re-renders in the same locale', () => {
    const seen: unknown[] = []
    let bumpChild: () => void = () => {}

    function Probe() {
      const t = useTranslations()
      const [, setN] = useState(0)
      bumpChild = () => setN(n => n + 1)
      seen.push(t)
      return null
    }

    render(
      <TranslationsProvider value={zhTW} locale="zh-TW">
        <Probe />
      </TranslationsProvider>
    )

    act(() => bumpChild())
    act(() => bumpChild())

    expect(seen.length).toBeGreaterThanOrEqual(3)
    for (const t of seen) {
      expect(t).toBe(seen[0])
    }
  })

  it('keeps t reference stable when parent re-renders without changing locale', () => {
    const seen: unknown[] = []
    let bumpParent: () => void = () => {}

    function Probe() {
      seen.push(useTranslations())
      return null
    }

    function Parent() {
      const [, setN] = useState(0)
      bumpParent = () => setN(n => n + 1)
      return (
        <TranslationsProvider value={zhTW} locale="zh-TW">
          <Probe />
        </TranslationsProvider>
      )
    }

    render(<Parent />)
    act(() => bumpParent())
    act(() => bumpParent())

    expect(seen.length).toBeGreaterThanOrEqual(3)
    for (const t of seen) {
      expect(t).toBe(seen[0])
    }
  })
})
