import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, fireEvent } from '@testing-library/react'
import { Switch } from '@/components/Switch'

/**
 * #1227 — the Switch track is 44×26 (iOS silhouette, DESIGN.md), below the 44px
 * touch target. The fix grows only the hit area via a transparent `::before`.
 * jsdom does no layout, so the geometry is asserted from globals.css itself.
 *
 * Failure looks like: visuals and tests fine, but taps on the switch's top or
 * bottom edge do nothing on a real device — no error anywhere.
 */

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function rule(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`))
  if (!m) throw new Error(`rule not found: ${selector}`)
  return Object.fromEntries(
    m[2]
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(':')
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()]
      }),
  )
}

function px(value: string): number {
  const v = value.match(/^var\((--[a-z0-9-]+)\)$/)
  if (v) {
    const def = css.match(new RegExp(`${v[1]}\\s*:\\s*([0-9.]+)px`))
    if (!def) throw new Error(`token not defined in px: ${v[1]}`)
    return Number(def[1])
  }
  const n = value.match(/^([0-9.]+)px$/)
  if (!n) throw new Error(`not a px value: ${value}`)
  return Number(n[1])
}

describe('Switch visual size (unchanged)', () => {
  it('track stays 44×26', () => {
    const track = rule('.oik-switch')
    expect(px(track.width)).toBe(44)
    expect(px(track.height)).toBe(26)
  })
})

describe('Switch hit area (#1227)', () => {
  const track = rule('.oik-switch')
  const hit = rule('.oik-switch::before')

  it('pseudo-element is an absolutely positioned, unpainted overlay', () => {
    expect(track.position).toBe('relative')
    expect(hit.content).toBe('""')
    expect(hit.position).toBe('absolute')
    expect(hit.background).toBeUndefined()
    expect(hit['pointer-events']).toBeUndefined()
  })

  it('is ≥44px tall, vertically centred on the track, as wide as the track', () => {
    const hitHeight = px(hit.height)
    expect(hitHeight).toBeGreaterThanOrEqual(44)
    expect(hit.top).toBe('50%')
    expect(hit.transform).toBe('translateY(-50%)')
    expect(hit.left).toBe('0')
    expect(hit.right).toBe('0')
    // Overhang per side — callers need at least this much clear space.
    expect((hitHeight - px(track.height)) / 2).toBe(9)
  })
})

describe('Switch semantics (unchanged)', () => {
  it('exposes role=switch with aria-checked on a native button and toggles on click', () => {
    const onChange = vi.fn()
    const { getByRole, rerender } = render(<Switch checked={false} onChange={onChange} ariaLabel="Offline" />)
    const sw = getByRole('switch', { name: 'Offline' })
    expect(sw.tagName).toBe('BUTTON')
    expect(sw.getAttribute('type')).toBe('button')
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<Switch checked onChange={onChange} ariaLabel="Offline" />)
    expect(getByRole('switch', { name: 'Offline' }).getAttribute('aria-checked')).toBe('true')
  })

  it('disabled switch is not activatable', () => {
    const onChange = vi.fn()
    const { getByRole } = render(<Switch checked={false} onChange={onChange} disabled ariaLabel="x" />)
    const sw = getByRole('switch')
    expect((sw as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(sw)
    expect(onChange).not.toHaveBeenCalled()
  })
})
