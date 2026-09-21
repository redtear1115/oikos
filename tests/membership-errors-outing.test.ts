import { describe, it, expect } from 'vitest'
import { describeMembershipError } from '@/lib/membership-errors'
import { describeError } from '@/lib/errors'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

// #943 S-E — the two outing fences reach the user as sentences, not codes.
describe.each([['zh-TW', zhTW], ['zh-CN', zhCN], ['en', en], ['ja', ja]])('%s', (_loc, t) => {
  it('removePartner › active_outing', () => {
    const msg = describeMembershipError(
      { ok: false, code: 'active_outing' },
      t.settings.dangerZone.errors,
      t.common.offlineError,
      t.errors.actions,
    )
    expect(msg).toBe(t.settings.dangerZone.errors.activeOuting)
    expect(msg).not.toMatch(/active_outing|[!！]/)
  })

  it('leaveGroup › leave_active_outing', () => {
    const msg = describeError({ ok: false, code: 'leave_active_outing' }, 'fallback', undefined, t.errors.actions)
    expect(msg).toBe(t.errors.actions.leave_active_outing)
  })
})
