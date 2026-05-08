import { describe, it, expect } from 'vitest'
import { resolveDisplayName } from '@/lib/display-name'

describe('resolveDisplayName', () => {
  it('returns nickname as primary when nickname is non-empty', () => {
    const r = resolveDisplayName('陳小元', '元寶')
    expect(r.primary).toBe('元寶')
    expect(r.secondary).toBe('陳小元')
  })

  it('falls back to legal name when nickname is null', () => {
    const r = resolveDisplayName('陳小元', null)
    expect(r.primary).toBe('陳小元')
    expect(r.secondary).toBeNull()
  })

  it('falls back to legal name when nickname is undefined', () => {
    const r = resolveDisplayName('陳小元', undefined)
    expect(r.primary).toBe('陳小元')
    expect(r.secondary).toBeNull()
  })

  it('falls back to legal name when nickname is an empty string', () => {
    const r = resolveDisplayName('陳小元', '')
    expect(r.primary).toBe('陳小元')
    expect(r.secondary).toBeNull()
  })

  it('falls back to legal name when nickname is whitespace only', () => {
    const r = resolveDisplayName('陳小元', '   ')
    expect(r.primary).toBe('陳小元')
    expect(r.secondary).toBeNull()
  })

  it('trims whitespace around a non-empty nickname', () => {
    const r = resolveDisplayName('陳小元', '  元寶  ')
    expect(r.primary).toBe('元寶')
    expect(r.secondary).toBe('陳小元')
  })
})
