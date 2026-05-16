import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}))

import { headers, cookies } from 'next/headers'

const mockHeaders = (entries: Record<string, string>) => {
  vi.mocked(headers).mockResolvedValue({
    get: (k: string) => entries[k] ?? null,
  } as unknown as Awaited<ReturnType<typeof headers>>)
}

const mockCookie = (value: string | undefined) => {
  vi.mocked(cookies).mockResolvedValue({
    get: () => (value ? { value } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>)
}

// vi.resetModules() clears the non-mocked module cache so each test re-evaluates
// lib/i18n/t.ts (bypassing React cache() memoization), but vi.mock-registered
// modules stay registered — so the static `headers` / `cookies` mock fn refs at
// the top of this file are the SAME instances t.ts sees after the dynamic import.
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('getLocale', () => {
  it('returns x-locale header value when present and valid', async () => {
    mockHeaders({ 'x-locale': 'en' })
    mockCookie(undefined)
    const { getLocale } = await import('@/lib/i18n/t')
    expect(await getLocale()).toBe('en')
  })

  it('prefers x-locale header over cookie', async () => {
    mockHeaders({ 'x-locale': 'ja' })
    mockCookie('en')
    const { getLocale } = await import('@/lib/i18n/t')
    expect(await getLocale()).toBe('ja')
  })

  it('falls back to cookie when x-locale header is missing', async () => {
    mockHeaders({})
    mockCookie('zh-CN')
    const { getLocale } = await import('@/lib/i18n/t')
    expect(await getLocale()).toBe('zh-CN')
  })

  it('falls back to default when neither header nor cookie is valid', async () => {
    mockHeaders({ 'x-locale': 'klingon' })
    mockCookie(undefined)
    const { getLocale } = await import('@/lib/i18n/t')
    expect(await getLocale()).toBe('zh-TW')
  })

  it('ignores invalid x-locale header and falls back to cookie', async () => {
    mockHeaders({ 'x-locale': 'fr' })
    mockCookie('en')
    const { getLocale } = await import('@/lib/i18n/t')
    expect(await getLocale()).toBe('en')
  })
})
