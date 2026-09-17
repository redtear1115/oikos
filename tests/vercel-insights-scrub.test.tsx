import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { REDACTED_URL, MASKED_VALUE } from '@/lib/analytics/urlSanitizer'

/**
 * #1274 — Vercel Web Analytics and Speed Insights must not receive invite
 * tokens or ledger filter values through their `url` field, and a failure
 * inside our own sanitizing must never look like "drop the event" to the
 * SDK (both treat a falsy `beforeSend` return as "drop").
 */

const TOKEN = 'ZZ_TOKEN_ZZ'
const AMOUNT = '87654321'

function expectClean(value: unknown) {
  const json = JSON.stringify(value)
  expect(json).not.toContain(TOKEN)
  expect(json).not.toContain(AMOUNT)
}

describe('analyticsBeforeSend (Vercel Web Analytics)', () => {
  it('masks a ledger filter value and keeps utm_source, preserving type', async () => {
    const { analyticsBeforeSend } = await import('@/app/vercel-insights')
    const event = {
      type: 'pageview' as const,
      url: `/records?fAmtMin=${AMOUNT}&utm_source=futari_app`,
    }
    const result = analyticsBeforeSend(event)
    expect(result).not.toBeNull()
    expectClean(result)
    expect(result!.url).toContain('utm_source=futari_app')
    expect(result!.url).toContain(`fAmtMin=${MASKED_VALUE}`)
    expect(result!.type).toBe('pageview')
  })

  it('replaces an invite token path segment with :token', async () => {
    const { analyticsBeforeSend } = await import('@/app/vercel-insights')
    const result = analyticsBeforeSend({ type: 'event', url: `/invite/${TOKEN}` })
    expectClean(result)
    expect(result!.url).toBe('/invite/:token')
    expect(result!.type).toBe('event')
  })

  it('preserves fields other than url', async () => {
    const { analyticsBeforeSend } = await import('@/app/vercel-insights')
    const event = { type: 'event' as const, url: '/dashboard', extra: 'kept' } as never
    const result = analyticsBeforeSend(event) as unknown as { extra: string }
    expect(result.extra).toBe('kept')
  })

  it('never returns null/undefined/false — sends a redacted url instead of dropping the event', async () => {
    const { analyticsBeforeSend } = await import('@/app/vercel-insights')
    // A url whose getter throws on every access simulates the SDK handing us
    // a hostile/malformed event; sanitizeEventUrl must not re-throw while
    // building its fallback.
    const hostile = {
      type: 'pageview' as const,
      get url(): string {
        throw new Error('boom')
      },
    }
    let result: ReturnType<typeof analyticsBeforeSend> | undefined
    expect(() => {
      result = analyticsBeforeSend(hostile as never)
    }).not.toThrow()
    expect(result).toBeTruthy()
    expect(result!.url).toBe(REDACTED_URL)
    expect(result!.type).toBe('pageview')
  })

  it('sends REDACTED_URL instead of an empty string', async () => {
    const { analyticsBeforeSend } = await import('@/app/vercel-insights')
    const result = analyticsBeforeSend({ type: 'pageview', url: '' })
    expect(result!.url).toBe(REDACTED_URL)
    expect(result!.url).not.toBe('')
  })

  it('is the same function reference across calls (stable for the SDKs useEffect dep)', async () => {
    const mod1 = await import('@/app/vercel-insights')
    const mod2 = await import('@/app/vercel-insights')
    expect(mod1.analyticsBeforeSend).toBe(mod2.analyticsBeforeSend)
  })
})

describe('speedInsightsBeforeSend (Vercel Speed Insights)', () => {
  it('masks a ledger filter value and keeps utm_source, preserving type/route', async () => {
    const { speedInsightsBeforeSend } = await import('@/app/vercel-insights')
    const event = {
      type: 'vital' as const,
      url: `/records?fAmtMin=${AMOUNT}&utm_source=futari_app`,
      route: '/records',
    }
    const result = speedInsightsBeforeSend(event)
    expectClean(result)
    expect(result!.url).toContain('utm_source=futari_app')
    expect(result!.url).toContain(`fAmtMin=${MASKED_VALUE}`)
    expect(result!.type).toBe('vital')
    expect(result!.route).toBe('/records')
  })

  it('replaces an invite token path segment with :token', async () => {
    const { speedInsightsBeforeSend } = await import('@/app/vercel-insights')
    const result = speedInsightsBeforeSend({ type: 'vital', url: `/invite/${TOKEN}` })
    expectClean(result)
    expect(result!.url).toBe('/invite/:token')
  })

  it('never returns a falsy value even when the url getter throws', async () => {
    const { speedInsightsBeforeSend } = await import('@/app/vercel-insights')
    const hostile = {
      type: 'vital' as const,
      get url(): string {
        throw new Error('boom')
      },
    }
    let result: ReturnType<typeof speedInsightsBeforeSend> | undefined
    expect(() => {
      result = speedInsightsBeforeSend(hostile as never)
    }).not.toThrow()
    expect(result).toBeTruthy()
    expect(result!.url).toBe(REDACTED_URL)
  })

  it('sends REDACTED_URL instead of an empty string', async () => {
    const { speedInsightsBeforeSend } = await import('@/app/vercel-insights')
    const result = speedInsightsBeforeSend({ type: 'vital', url: '' })
    expect(result!.url).toBe(REDACTED_URL)
    expect(result!.url).not.toBe('')
  })

  it('is the same function reference across calls', async () => {
    const mod1 = await import('@/app/vercel-insights')
    const mod2 = await import('@/app/vercel-insights')
    expect(mod1.speedInsightsBeforeSend).toBe(mod2.speedInsightsBeforeSend)
  })
})

describe('VercelInsights wrapper', () => {
  it('renders Analytics and SpeedInsights with the shared beforeSend functions', async () => {
    const analyticsSpy = vi.fn((_props: Record<string, unknown>) => null)
    const speedInsightsSpy = vi.fn((_props: Record<string, unknown>) => null)
    vi.doMock('@vercel/analytics/next', () => ({ Analytics: analyticsSpy }))
    vi.doMock('@vercel/speed-insights/next', () => ({ SpeedInsights: speedInsightsSpy }))
    vi.resetModules()

    const { VercelInsights, analyticsBeforeSend, speedInsightsBeforeSend } = await import(
      '@/app/vercel-insights'
    )
    render(<VercelInsights />)

    expect(analyticsSpy.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ beforeSend: analyticsBeforeSend }),
    )
    expect(speedInsightsSpy.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ beforeSend: speedInsightsBeforeSend }),
    )

    vi.doUnmock('@vercel/analytics/next')
    vi.doUnmock('@vercel/speed-insights/next')
    vi.resetModules()
  })
})
