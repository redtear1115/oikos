import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { join } from 'path'
import { PROTECTED_ROOT_SEGMENTS, isKnownProtectedPath } from '@/lib/auth/protectedPaths'

// #1275: proxy 只替 PROTECTED_ROOT_SEGMENTS 裡的頁帶 `?next=`。
// 新增 dashboard 頁卻忘了加進清單，失效的樣子是：沒有任何錯誤，
// 只是那頁未登入點進來、登入後靜默落到 /dashboard 而不是原頁。

const DASHBOARD_GROUP = join(process.cwd(), 'app', '(dashboard)')
const OUTSIDE_GROUP = ['onboarding', 'setup']

describe('PROTECTED_ROOT_SEGMENTS drift (#1275)', () => {
  it('equals app/(dashboard) route dirs ∪ {onboarding, setup}', () => {
    const routeDirs = readdirSync(DASHBOARD_GROUP, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name)
    const expected = [...new Set([...routeDirs, ...OUTSIDE_GROUP])].sort()
    expect([...PROTECTED_ROOT_SEGMENTS].sort()).toEqual(expected)
  })

  it('onboarding / setup still exist as top-level app dirs', () => {
    const appDirs = readdirSync(join(process.cwd(), 'app'))
    for (const d of OUTSIDE_GROUP) expect(appDirs).toContain(d)
  })
})

describe('isKnownProtectedPath', () => {
  it.each(['/dashboard', '/records', '/records/', '/settings/account', '/coming-soon', '/setup', '/onboarding'])(
    'protected: %s',
    (p) => {
      expect(isKnownProtectedPath(p)).toBe(true)
    },
  )

  it.each([
    '/', '/foo', '/api/export/transactions', '/dashboardx', '/en/dashboard',
    '//dashboard', '/dashboard\\x', 'dashboard', '', '/%2Fdashboard',
  ])('not protected: %j', (p) => {
    expect(isKnownProtectedPath(p)).toBe(false)
  })
})
