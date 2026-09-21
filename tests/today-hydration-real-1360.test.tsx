// #1360 — the same UTC-server → Taipei-device hydration run as
// today-hydration-1360.test.tsx, on the real components that render
// "today"-derived text: the 愛物 list cards (陪伴 N 天, N 歲 N 個月) and the
// feed row's 今天/昨天 label (CompactRow, also used on the dashboard).
//
// Two claims per component:
//   1. hydrating across the zone boundary reports zero recoverable errors;
//   2. the hydrated text is identical to a client-only render on the device —
//      i.e. what the browser showed before #1360.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { I18nWrapper } from './_mocks/i18n'
import { TodayProvider } from '@/app/(dashboard)/_components/TodayProvider'
import { MemberProvider, type MemberContextValue } from '@/app/(dashboard)/_components/MemberContext'
import { todayYMDIn } from '@/lib/today'
import { ChildCard, PlantCard } from '@/app/(dashboard)/assets/_components/AibutsuCard'
import { CompactRow } from '@/app/(dashboard)/dashboard/_components/CompactRow'

const INSTANT = new Date('2026-09-20T23:30:00Z') // 2026-09-21 07:30 in Taipei
const originalTZ = process.env.TZ

const member: MemberContextValue = {
  group: { id: 'g1', name: '我們家' },
  viewer: { id: 'u-me', initial: '我', displayName: '小明', avatarUrl: null, defaultSplitType: 'half', who: 'M' },
  partner: { id: 'u-you', initial: '對', displayName: '小華', avatarUrl: null, defaultSplitType: 'half', who: 'T' },
  viewerIsA: true,
  isSolo: false,
  isPast: false,
  canAccessGuardian: false,
  epochStartedAt: '2024-01-01T00:00:00.000Z',
  epochEndedAt: null,
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(INSTANT)
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = originalTZ
  document.body.innerHTML = ''
})

function tree(node: ReactNode, todayYMD: string) {
  return (
    <I18nWrapper>
      <MemberProvider value={member}>
        <TodayProvider todayYMD={todayYMD}>{node}</TodayProvider>
      </MemberProvider>
    </I18nWrapper>
  )
}

/** UTC server (cookie says Asia/Taipei) → Taipei device. */
async function ssrThenHydrate(node: ReactNode) {
  process.env.TZ = 'UTC'
  const t = tree(node, todayYMDIn('Asia/Taipei'))
  const html = renderToString(t)
  process.env.TZ = 'Asia/Taipei'
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  const errors: unknown[] = []
  await act(async () => {
    hydrateRoot(container, t, { onRecoverableError: (e) => errors.push(e) })
  })
  return { errors, text: container.textContent }
}

/** What the device shows with no server HTML at all. */
async function clientOnly(node: ReactNode) {
  process.env.TZ = 'Asia/Taipei'
  const container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () => {
    createRoot(container).render(tree(node, todayYMDIn('Asia/Taipei')))
  })
  return container.textContent
}

const row = (transactedAt: string) => ({
  id: transactedAt,
  amount: 120,
  splitType: 'half' as const,
  splitRatioA: null,
  description: '早餐',
  category: 'dining',
  paidBy: 'u-me',
  transactedAt,
  kind: 'transaction' as const,
})

describe('real components across the UTC → Taipei boundary (#1360)', () => {
  it.each([
    ['PlantCard (陪伴 N 天)', <PlantCard key="p" id="p1" name="小綠" monthAmount={0} totalAmount={0} isPast={false} plantSproutedAt="2026-09-01" />, '陪伴 20 天'],
    ['ChildCard (N 歲 N 個月)', <ChildCard key="c" id="c1" name="小寶" monthAmount={0} totalAmount={0} isPast={false} childBirthday="2025-08-21" />, '1 歲 1 個月'],
    // Stored at UTC noon (ymdToUTCNoon), as every transaction is.
    ['CompactRow (今天)', <CompactRow key="r1" tx={row('2026-09-21T12:00:00.000Z')} isLast />, '今天'],
    ['CompactRow (昨天)', <CompactRow key="r2" tx={row('2026-09-20T12:00:00.000Z')} isLast />, '昨天'],
  ])('%s', async (_name, node, expected) => {
    const r = await ssrThenHydrate(node)
    expect(r.errors).toEqual([])
    expect(r.text).toContain(expected)
    document.body.innerHTML = ''
    expect(r.text).toBe(await clientOnly(node))
  })
})
