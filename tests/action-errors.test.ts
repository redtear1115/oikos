import { describe, it, expect, afterEach, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeError } from '@/lib/errors'
import {
  actionError,
  isActionError,
  parseActionError,
  translateActionError,
} from '@/lib/action-errors'
import { zhTW } from '@/lib/i18n/locales/zh-TW'
import { zhCN } from '@/lib/i18n/locales/zh-CN'
import { en } from '@/lib/i18n/locales/en'
import { ja } from '@/lib/i18n/locales/ja'

/**
 * #1156 — server actions throw codes; `describeError` localizes them.
 *
 * As with quiz-errors.test.ts, zh-TW assertions alone prove nothing: the zh-TW
 * sentence is character-for-character what the action used to throw, so a
 * passthrough would satisfy them too. en / ja are what prove the lookup ran.
 */

const OFFLINE = 'offline'
const FALLBACK = 'fallback'
const locales = { 'zh-TW': zhTW, 'zh-CN': zhCN, en, ja } as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('describeError — action codes', () => {
  it('resolves a known code to the viewer locale', () => {
    const e = actionError('base_currency_locked')
    expect(describeError(e, FALLBACK, OFFLINE, zhTW.errors.actions)).toBe('當前章節已有紀錄、不可修改主體幣別')
    expect(describeError(e, FALLBACK, OFFLINE, en.errors.actions)).toBe(en.errors.actions.base_currency_locked)
    expect(describeError(e, FALLBACK, OFFLINE, ja.errors.actions)).toBe(ja.errors.actions.base_currency_locked)
    expect(describeError(e, FALLBACK, OFFLINE, en.errors.actions)).not.toBe(zhTW.errors.actions.base_currency_locked)
  })

  it('fills params encoded after the code', () => {
    const e = actionError('import_row_invalid_amount', { row: 3 })
    expect(describeError(e, FALLBACK, OFFLINE, zhTW.errors.actions)).toBe('第 3 筆：金額不正確')
    expect(describeError(e, FALLBACK, OFFLINE, en.errors.actions)).toBe('Row 3: invalid amount')

    const fx = actionError('fx_rate_not_set', { from: 'JPY', to: 'TWD' })
    expect(describeError(fx, FALLBACK, OFFLINE, zhTW.errors.actions)).toBe('未設定 JPY → TWD 匯率')
  })

  it('params survive characters that need escaping', () => {
    const e = actionError('import_source_unsupported', { source: 'a&b=c?d 中' })
    expect(describeError(e, FALLBACK, OFFLINE, en.errors.actions)).toBe('Unsupported import source: a&b=c?d 中')
  })

  it('returns the fallback — not e.message — for an unknown error', () => {
    expect(describeError(new Error('duplicate key value violates unique constraint'), FALLBACK, OFFLINE, en.errors.actions))
      .toBe(FALLBACK)
    // Legacy zh-TW prose (e.g. from lib/validators.ts) must not reach en users.
    expect(describeError(new Error('名稱不能為空'), FALLBACK, OFFLINE, en.errors.actions)).toBe(FALLBACK)
    // Code-shaped but not in the dictionary: fallback, never the raw code.
    expect(describeError(new Error('no_such_code'), FALLBACK, OFFLINE, en.errors.actions)).toBe(FALLBACK)
    // Prototype keys are not codes.
    expect(describeError(new Error('constructor'), FALLBACK, OFFLINE, en.errors.actions)).toBe(FALLBACK)
    expect(describeError('not an error', FALLBACK, OFFLINE, en.errors.actions)).toBe(FALLBACK)
  })

  it('still prefers the offline message for network failures', () => {
    expect(describeError(new TypeError('Failed to fetch'), FALLBACK, OFFLINE, en.errors.actions)).toBe(OFFLINE)
    vi.stubGlobal('navigator', { onLine: false })
    expect(describeError(actionError('trip_not_found'), FALLBACK, OFFLINE, en.errors.actions)).toBe(OFFLINE)
  })
})

describe('action-errors helpers', () => {
  it('parseActionError splits code and params', () => {
    expect(parseActionError(actionError('trip_rate_missing', { currency: 'USD' })))
      .toEqual({ code: 'trip_rate_missing', params: { currency: 'USD' } })
    expect(parseActionError(new Error('找不到旅行'))).toBeNull()
  })

  it('isActionError matches by code, independent of locale', () => {
    const e = actionError('pending_expense_handled_elsewhere')
    expect(isActionError(e, 'pending_expense_not_found', 'pending_expense_handled_elsewhere')).toBe(true)
    expect(isActionError(e, 'pending_income_not_found')).toBe(false)
    expect(isActionError(new Error('待確認支出已被其他裝置處理'), 'pending_expense_handled_elsewhere')).toBe(false)
  })

  it('translateActionError returns null for unknown input', () => {
    expect(translateActionError(new Error('nope'), en.errors.actions)).toBeNull()
  })
})

describe('errors.actions dictionary', () => {
  it('every locale fills every placeholder the zh-TW sentence uses', () => {
    const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort()
    for (const [code, zh] of Object.entries(zhTW.errors.actions)) {
      for (const [name, dict] of Object.entries(locales)) {
        const msg = (dict.errors.actions as Record<string, string>)[code]
        expect(placeholders(msg), `${name}.${code}`).toEqual(placeholders(zh))
      }
    }
  })

  it('en and ja are actually translated (no CJK-only zh-TW copy left in en)', () => {
    for (const [code, msg] of Object.entries(en.errors.actions)) {
      expect(/[一-鿿]/.test(msg), `en.${code}`).toBe(false)
    }
    for (const [code, msg] of Object.entries(ja.errors.actions)) {
      expect(msg, `ja.${code}`).not.toBe((zhTW.errors.actions as Record<string, string>)[code])
    }
  })

  it('UI copy rules: no exclamation marks', () => {
    for (const [name, dict] of Object.entries(locales)) {
      for (const [code, msg] of Object.entries(dict.errors.actions)) {
        expect(/[!！]/.test(msg), `${name}.${code}`).toBe(false)
      }
    }
  })
})

/**
 * The regression guard the issue asked for: without it, this class of bug grows
 * back one `throw new Error('<句子>')` at a time. A thrown CJK literal in
 * `actions/` fails here; throw `actionError('<code>')` instead.
 *
 * Failure looks like: a list of `file:line` entries below. It does not catch
 * prose thrown from `lib/` helpers that actions call (e.g. lib/validators.ts) —
 * those still reach `describeError` and render as the generic fallback.
 */
describe('actions/ throws no CJK prose', () => {
  it('has no `throw new Error(...)` with a CJK literal', () => {
    const dir = join(process.cwd(), 'actions')
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      readFileSync(join(dir, file), 'utf8').split('\n').forEach((line, i) => {
        if (/throw new Error\(.*[぀-ヿ一-鿿]/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
