import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recentIncomeLabel } from '@/lib/recentIncomeLabel'
import { todayYMDIn } from '@/lib/today'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// #1362 — 2026-09-20T23:30Z is 2026-09-21 07:30 in Taipei. A UTC server's
// "today" is still the 20th; the viewer's is the 21st.
const NOW = new Date('2026-09-20T23:30:00Z')
const serverToday = todayYMDIn('UTC', NOW)
const viewerToday = todayYMDIn('Asia/Taipei', NOW)
const label = (occurredAt: string, today: string) =>
  recentIncomeLabel({ occurredAt, category: 'salary', source: null }, 'zh-TW', today, zhTW.incomeCategory)

describe('income hero 今天／昨天 at 07:30 Taipei (UTC server)', () => {
  it('the two clocks disagree at this instant', () => {
    expect(serverToday).toBe('2026-09-20')
    expect(viewerToday).toBe('2026-09-21')
  })

  it('with the server clock it is wrong — the bug this issue describes', () => {
    expect(label('2026-09-21', serverToday)).not.toMatch(/^今天/)
    expect(label('2026-09-20', serverToday)).toMatch(/^今天/)
  })

  it("with the viewer's today it is right", () => {
    expect(label('2026-09-21', viewerToday)).toBe(`今天 · ${zhTW.incomeCategory.salary}`)
    expect(label('2026-09-20', viewerToday)).toBe(`昨天 · ${zhTW.incomeCategory.salary}`)
  })

  it('the source name wins over the category label', () => {
    expect(recentIncomeLabel({ occurredAt: '2026-09-21', category: 'salary', source: '年終' }, 'zh-TW', viewerToday, zhTW.incomeCategory))
      .toBe('今天 · 年終')
  })

  it('the dashboard passes the viewer\'s today, not the server clock', () => {
    const src = readFileSync(join(process.cwd(), 'app/(dashboard)/dashboard/page.tsx'), 'utf8')
    expect(src).toMatch(/recentIncomeLabel\([^)]*await getTodayYMD\(\)/)
    expect(src).not.toMatch(/localTodayISO\(\)/)
  })
})
