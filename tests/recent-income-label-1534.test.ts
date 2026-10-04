import { describe, it, expect } from 'vitest'
import { recentIncomeLabel } from '@/lib/recentIncomeLabel'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1534 — the dashboard income hero line indexed the translation object with
// the raw DB category. An inherited key ('constructor', '__proto__',
// 'toString') returned Object.prototype members, so the line read
// 「今天 · function Object() { [native code] }」 or 「今天 · [object Object]」
// instead of falling back to 其他.
describe('recentIncomeLabel with an inherited-key category', () => {
  it.each(['constructor', '__proto__', 'toString'])('%s falls back to the other label', (category) => {
    const s = recentIncomeLabel(
      { occurredAt: '2026-09-21', category, source: null },
      'zh-TW',
      '2026-09-21',
      zhTW.incomeCategory,
    )
    expect(s).toBe(`今天 · ${zhTW.incomeCategory.other}`)
  })

  it('a real category still shows its own label', () => {
    const s = recentIncomeLabel(
      { occurredAt: '2026-09-21', category: 'bonus', source: null },
      'zh-TW',
      '2026-09-21',
      zhTW.incomeCategory,
    )
    expect(s).toBe(`今天 · ${zhTW.incomeCategory.bonus}`)
  })
})
