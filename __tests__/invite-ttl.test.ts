import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { INVITE_TTL_MS } from '@/lib/invite'

// ─── #1288 I2 — invite links last 24 hours ────────────────────────────────
//
// The TTL used to be a bare `7 * 24 * 60 * 60 * 1000` inside createInvite,
// and several comments restated "7-day". When the number changes and a comment
// does not, nothing errors: the next reader reasons about a 7-day exposure
// window that no longer exists. These checks pin the constant, pin that
// createInvite uses it, and fail on any invite comment in the code that still
// says 7 days.
//
// The DB-level behaviour (a new row's `expires_at - created_at` is exactly
// 24 h) is covered by the integration test in
// `__tests__/actions/invite.ttlAndLockOrder.test.ts`.
// ──────────────────────────────────────────────────────────────────────────

const root = resolve(__dirname, '..')

describe('invite TTL (#1288 I2)', () => {
  it('is 24 hours', () => {
    expect(INVITE_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('createInvite stamps the expiry from INVITE_TTL_MS, not a literal', () => {
    const src = readFileSync(join(root, 'actions/invite.ts'), 'utf-8')
    expect(src).toMatch(/INVITE_TTL_MS/)
    expect(src).not.toMatch(/7\s*\*\s*24\s*\*\s*60/)
  })

  it('no code comment says an invite lasts 7 days', () => {
    const sevenDays = /\b7[- ]?days?\b|7-day|7 ?天|七天|seven[- ]days?/i
    const inviteish = /invite|邀請|邀请|招待|ticket|key to|valid key/i
    const offenders: string[] = []

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) {
          readFileSync(p, 'utf-8').split('\n').forEach((line, i) => {
            if (sevenDays.test(line) && inviteish.test(line)) {
              offenders.push(`${p.slice(root.length + 1)}:${i + 1}: ${line.trim()}`)
            }
          })
        }
      }
    }
    for (const dir of ['actions', 'lib', 'app', 'components']) walk(join(root, dir))

    expect(offenders).toEqual([])
  })
})
