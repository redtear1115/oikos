import { describe, it, expect, afterEach } from 'vitest'
import * as SentryBrowser from '@sentry/browser'
import type { Breadcrumb, Event, Log } from '@sentry/nextjs'
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
} from '@/lib/observability/sentryScrub'
import { MASKED_VALUE, REDACTED_URL } from '@/lib/analytics/urlSanitizer'

/**
 * #1274 — Sentry must not receive invite tokens, ledger filter values,
 * cookies or client IPs, through any of its payload types.
 *
 * Part 1 feeds hand-built payloads shaped like the ones the SDK produces
 * (field names taken from @sentry/* 10.53.1 source) through each hook.
 * Part 2 runs the real browser SDK with a capturing transport, so an SDK
 * upgrade that moves the URL into a new field turns this red. Part 2 carries
 * an unscrubbed control: if the control stops leaking, the harness captures
 * nothing and every `not.toContain` would pass vacuously.
 */

const TOKEN = 'ZZ_TOKEN_ZZ'
const AMOUNT = '87654321'

type SpanJSON = Parameters<typeof scrubSentrySpan>[0]

function expectClean(value: unknown) {
  const json = JSON.stringify(value)
  expect(json).not.toContain(TOKEN)
  expect(json).not.toContain(AMOUNT)
}

function span(overrides: Partial<SpanJSON>): SpanJSON {
  return {
    span_id: 'a'.repeat(16),
    trace_id: 'b'.repeat(32),
    start_timestamp: 1,
    timestamp: 2,
    data: {},
    ...overrides,
  }
}

describe('scrubSentryEvent — client error event', () => {
  it('scrubs request url, drops headers and cookies, keeps path and keys', () => {
    const event: Event = {
      event_id: 'e1',
      exception: { values: [{ type: 'Error', value: 'boom' }] },
      request: {
        url: `https://futari.example/records?fAmtMin=${AMOUNT}&utm_source=futari_app#row`,
        headers: {
          'User-Agent': 'UA',
          Referer: `https://futari.example/sign-in?next=/invite/${TOKEN}`,
        },
        cookies: { 'sb-access-token': 'secret' },
      },
      user: { id: 'u1', ip_address: '203.0.113.9' },
    }
    const out = scrubSentryEvent(event)
    expectClean(out)
    expect(out.request?.url).toBe(
      `https://futari.example/records?fAmtMin=${MASKED_VALUE}&utm_source=futari_app`,
    )
    expect(out.request).not.toHaveProperty('headers')
    expect(out.request).not.toHaveProperty('cookies')
    expect(out.user).toEqual({ id: 'u1' })
    // Non-URL content is untouched.
    expect(out.exception).toEqual(event.exception)
    expect(out.event_id).toBe('e1')
  })

  it('drops the request body (server action arguments)', () => {
    // A server action POST: the body is the serialized argument list, so
    // `acceptInvite(token)` puts the token here. Object and string forms both
    // occur (the SDK stores whatever the body parser produced).
    for (const data of [`["${TOKEN}"]`, { 0: TOKEN, description: 'ledger', amount: AMOUNT }]) {
      const out = scrubSentryEvent({
        request: { method: 'POST', url: 'https://futari.example/invite/abc', data },
      })
      expectClean(out)
      expect(out.request).not.toHaveProperty('data')
      expect(out.request?.method).toBe('POST')
    }
  })

  it('does not mutate its input', () => {
    const event: Event = { request: { url: `/invite/${TOKEN}`, cookies: { a: 'b' } } }
    const snapshot = JSON.stringify(event)
    scrubSentryEvent(event)
    expect(JSON.stringify(event)).toBe(snapshot)
  })
})

describe('scrubSentryEvent — client transaction', () => {
  it('scrubs name, trace data (url.full, referer header) and child span data', () => {
    const event: Event = {
      type: 'transaction',
      transaction: `/invite/${TOKEN}`,
      request: {
        url: `https://futari.example/invite/${TOKEN}?utm_source=x`,
        headers: { Referer: `https://futari.example/records?fQ=${AMOUNT}` },
      },
      contexts: {
        trace: {
          trace_id: 'b'.repeat(32),
          span_id: 'a'.repeat(16),
          op: 'pageload',
          data: {
            'sentry.op': 'pageload',
            'url.full': `https://futari.example/invite/${TOKEN}`,
            'http.request.header.referer': `https://futari.example/records?fQ=${AMOUNT}`,
            'http.request.header.user_agent': 'UA',
          },
        },
      },
      spans: [
        span({
          op: 'http.client',
          description: `GET https://api.example/rest/v1/tx?amount=eq.${AMOUNT}`,
          data: {
            url: `/api/x?fAmtMin=${AMOUNT}`,
            'http.url': `https://api.example/rest/v1/tx?amount=eq.${AMOUNT}#frag`,
            'http.query': `?amount=eq.${AMOUNT}`,
            'http.fragment': `#${TOKEN}`,
            'server.address': 'api.example',
            'http.method': 'GET',
          },
        }),
      ],
    }
    const out = scrubSentryEvent(event)
    expectClean(out)
    expect(out.transaction).toBe('/invite/:token')
    expect(out.request).not.toHaveProperty('headers')
    const traceData = out.contexts?.trace?.data as Record<string, unknown>
    expect(traceData['url.full']).toBe('https://futari.example/invite/:token')
    expect(traceData['http.request.header.referer']).toBe('[Filtered]')
    expect(traceData['http.request.header.user_agent']).toBe('UA')
    expect(traceData['sentry.op']).toBe('pageload')
    const child = out.spans![0]
    expect(child.description).toBe(`GET https://api.example/rest/v1/tx?amount=${MASKED_VALUE}`)
    expect(child.data).toMatchObject({
      url: `/api/x?fAmtMin=${MASKED_VALUE}`,
      'http.url': `https://api.example/rest/v1/tx?amount=${MASKED_VALUE}`,
      'http.query': `?amount=${MASKED_VALUE}`,
      'server.address': 'api.example',
      'http.method': 'GET',
    })
    expect(child.data).not.toHaveProperty('http.fragment')
  })

  it('keeps parameterized route names byte-identical', () => {
    for (const name of ['/invite/[token]', 'GET /invite/[token]', '/[locale]/migrate/[source]', 'GET /records']) {
      expect(scrubSentryEvent({ type: 'transaction', transaction: name }).transaction).toBe(name)
    }
  })
})

describe('scrubSentryEvent — server event', () => {
  const base = (query_string: unknown): Event => ({
    request: {
      method: 'GET',
      url: `https://futari.example/auth/callback?code=${TOKEN}&next=/invite/${TOKEN}`,
      query_string: query_string as never,
      cookies: { 'sb-auth-token': TOKEN },
      headers: { cookie: `sb=${TOKEN}`, 'x-forwarded-for': '203.0.113.9' },
      env: { REMOTE_ADDR: '203.0.113.9' },
    },
    transaction: `GET /invite/${TOKEN}`,
    contexts: {
      nextjs: {
        request_path: `/invite/${TOKEN}?fAmtMin=${AMOUNT}`,
        router_path: '/invite/[token]',
        router_kind: 'App Router',
        route_type: 'render',
      },
      trace: {
        trace_id: 'b'.repeat(32),
        span_id: 'a'.repeat(16),
        data: {
          'http.url': `https://futari.example/invite/${TOKEN}?fAmtMin=${AMOUNT}`,
          'http.target': `/invite/${TOKEN}?fAmtMin=${AMOUNT}`,
          'url.query': `fAmtMin=${AMOUNT}&tab=list`,
          'http.client_ip': '203.0.113.9',
          'user.ip_address': '203.0.113.9',
          'http.request.header.x_vercel_forwarded_for': '203.0.113.9',
          'http.request.header.next_url': `/invite/${TOKEN}`,
          'http.method': 'GET',
          'http.route': '/invite/[token]',
        },
      },
      os: { name: 'linux' },
    },
    user: { ip_address: '203.0.113.9' },
  })

  it.each<[string, unknown, unknown]>([
    ['string', `code=${TOKEN}&fAmtMin=${AMOUNT}&utm_source=x`, `code=${MASKED_VALUE}&fAmtMin=${MASKED_VALUE}&utm_source=x`],
    [
      'pairs',
      [['code', TOKEN], ['FROM', 'push'], ['fAmtMin', AMOUNT]],
      [['code', MASKED_VALUE], ['FROM', 'push'], ['fAmtMin', MASKED_VALUE]],
    ],
    [
      'object',
      { code: TOKEN, tab: 'list', fAmtMin: AMOUNT },
      { code: MASKED_VALUE, tab: 'list', fAmtMin: MASKED_VALUE },
    ],
  ])('query_string as %s', (_label, input, expected) => {
    const out = scrubSentryEvent(base(input))
    expectClean(out)
    expect(out.request?.query_string).toEqual(expected)
    expect(out.request?.url).toBe(
      `https://futari.example/auth/callback?code=${MASKED_VALUE}&next=${MASKED_VALUE}`,
    )
    expect(out.request).not.toHaveProperty('cookies')
    expect(out.request).not.toHaveProperty('headers')
    expect(out.request).not.toHaveProperty('env')
    expect(out.request?.method).toBe('GET')
    expect(out.transaction).toBe('GET /invite/:token')
    expect(out.contexts?.nextjs).toEqual({
      request_path: `/invite/:token?fAmtMin=${MASKED_VALUE}`,
      router_path: '/invite/[token]',
      router_kind: 'App Router',
      route_type: 'render',
    })
    expect(out.contexts?.os).toEqual({ name: 'linux' })
    const data = out.contexts?.trace?.data as Record<string, unknown>
    expect(data).toEqual({
      'http.url': `https://futari.example/invite/:token?fAmtMin=${MASKED_VALUE}`,
      'http.target': `/invite/:token?fAmtMin=${MASKED_VALUE}`,
      'url.query': `fAmtMin=${MASKED_VALUE}&tab=list`,
      'http.request.header.x_vercel_forwarded_for': '[Filtered]',
      'http.request.header.next_url': '[Filtered]',
      'http.method': 'GET',
      'http.route': '/invite/[token]',
    })
    expect(JSON.stringify(out)).not.toContain('203.0.113.9')
  })

  it('drops a query_string of unknown shape', () => {
    const out = scrubSentryEvent(base(42))
    expect(out.request).not.toHaveProperty('query_string')
  })
})

describe('scrubSentryBreadcrumb', () => {
  it('navigation: from / to, relative stays relative', () => {
    const crumb: Breadcrumb = {
      category: 'navigation',
      data: { from: `/sign-in?next=/invite/${TOKEN}`, to: `/records?fAmtMin=${AMOUNT}&view=list` },
    }
    const out = scrubSentryBreadcrumb(crumb)
    expectClean(out)
    expect(out.data).toEqual({
      from: `/sign-in?next=${MASKED_VALUE}`,
      to: `/records?fAmtMin=${MASKED_VALUE}&view=list`,
    })
  })

  it.each(['fetch', 'xhr'])('%s: data.url, without touching the shared data object', category => {
    const data = { method: 'GET', url: `https://api.example/invite/${TOKEN}?q=${AMOUNT}`, status_code: 200 }
    const out = scrubSentryBreadcrumb({ type: 'http', category, data })
    expectClean(out)
    expect(out.data).toEqual({
      method: 'GET',
      url: `https://api.example/invite/:token?q=${MASKED_VALUE}`,
      status_code: 200,
    })
    // The fetch integration hands us its own `fetchData` object.
    expect(data.url).toContain(TOKEN)
  })

  it('leaves non-URL breadcrumbs alone', () => {
    const crumb: Breadcrumb = { category: 'ui.click', message: 'button.primary', data: { target: 'div > button' } }
    expect(scrubSentryBreadcrumb(crumb)).toEqual(crumb)
  })

  it('scrubs URLs inside a console message', () => {
    const out = scrubSentryBreadcrumb({ category: 'console', message: `failed /invite/${TOKEN} and GET /records` })
    expect(out.message).toBe('failed /invite/:token and GET /records')
  })

  it('events scrub their breadcrumbs again', () => {
    const out = scrubSentryEvent({
      breadcrumbs: [{ category: 'navigation', data: { to: `/invite/${TOKEN}` } }],
    })
    expectClean(out)
    expect(out.breadcrumbs?.[0].data).toEqual({ to: '/invite/:token' })
  })
})

describe('scrubSentrySpan', () => {
  it('scrubs a server span description and data', () => {
    const out = scrubSentrySpan(
      span({
        description: `GET /invite/${TOKEN}?x=${AMOUNT}`,
        op: 'http.server',
        data: {
          'http.target': `/invite/${TOKEN}?x=${AMOUNT}`,
          'http.client_ip': '203.0.113.9',
          'client.address': '203.0.113.9',
          'http.status_code': 200,
        },
      }),
    )
    expectClean(out)
    expect(out.description).toBe(`GET /invite/:token?x=${MASKED_VALUE}`)
    expect(out.data).toEqual({ 'http.target': `/invite/:token?x=${MASKED_VALUE}`, 'http.status_code': 200 })
    expect(out.op).toBe('http.server')
    expect(out.span_id).toBe('a'.repeat(16))
  })

  it('leaves unrelated descriptions alone', () => {
    for (const description of ['db.query select 1', 'GET /records', 'render /dashboard', 'a/b?c']) {
      expect(scrubSentrySpan(span({ description })).description).toBe(description)
    }
  })
})

describe('scrubSentryLog', () => {
  it('scrubs message, template parameters and URL attributes', () => {
    const log: Log = {
      level: 'error',
      message: `fetch failed https://futari.example/invite/${TOKEN}?fAmtMin=${AMOUNT}`,
      attributes: {
        'sentry.origin': 'auto.log.console',
        'sentry.message.template': 'fetch failed %s',
        'sentry.message.parameter.0': `https://futari.example/invite/${TOKEN}`,
        'url.full': `/records?fAmtMin=${AMOUNT}`,
        'user.ip_address': '203.0.113.9',
      },
    }
    const out = scrubSentryLog(log)
    expectClean(out)
    expect(out.level).toBe('error')
    expect(out.message).toBe(
      `fetch failed https://futari.example/invite/:token?fAmtMin=${MASKED_VALUE}`,
    )
    expect(out.attributes).toEqual({
      'sentry.origin': 'auto.log.console',
      'sentry.message.template': 'fetch failed %s',
      'sentry.message.parameter.0': 'https://futari.example/invite/:token',
      'url.full': `/records?fAmtMin=${MASKED_VALUE}`,
    })
  })
})

describe('hooks never throw and always return an object', () => {
  const cyclic: Record<string, unknown> = { request: { url: `/invite/${TOKEN}` } }
  cyclic.self = cyclic
  ;(cyclic.request as Record<string, unknown>).parent = cyclic
  const cyclicData: Record<string, unknown> = { url: `/invite/${TOKEN}` }
  cyclicData.self = cyclicData

  const throwing = {
    type: 'transaction',
    get request(): never {
      throw new Error('getter')
    },
    transaction: `/invite/${TOKEN}`,
    contexts: { trace: { span_id: 's', trace_id: 't', data: { 'http.url': `/invite/${TOKEN}` } } },
    spans: [{ span_id: 'c', description: `/invite/${TOKEN}` }],
  }

  const inputs: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['string', `/invite/${TOKEN}`],
    ['array', [`/invite/${TOKEN}`]],
    ['empty object', {}],
    ['cyclic', cyclic],
    ['getter throws', throwing],
    ['data getter throws', { get data(): never { throw new Error('x') }, description: `/invite/${TOKEN}` }],
  ]

  const hooks: Array<[string, (value: never) => unknown]> = [
    ['scrubSentryEvent', scrubSentryEvent as (value: never) => unknown],
    ['scrubSentrySpan', scrubSentrySpan as (value: never) => unknown],
    ['scrubSentryBreadcrumb', scrubSentryBreadcrumb as (value: never) => unknown],
    ['scrubSentryLog', scrubSentryLog as (value: never) => unknown],
  ]

  for (const [hookName, hook] of hooks) {
    it.each(inputs)(`${hookName}(%s)`, (_label, input) => {
      let out: unknown
      expect(() => {
        out = hook(input as never)
      }).not.toThrow()
      expect(out).toBeTypeOf('object')
      expect(out).not.toBeNull()
      // Not `not.toBe(input)`: its failure diff walks the throwing getters.
      expect(out === input).toBe(false)
      // A cyclic input keeps its unrelated back-references (the SDK
      // normalizes those before the hooks run); every other output must
      // serialize and must not leak.
      if (input !== cyclic) {
        expect(() => JSON.stringify(out)).not.toThrow()
        expectClean(out)
      }
    })
  }

  it('cyclic input: the fields each hook owns are still scrubbed', () => {
    const event = scrubSentryEvent(cyclic as Event)
    expect(event.request?.url).toBe('/invite/:token')
    const crumb = scrubSentryBreadcrumb({ data: cyclicData } as Breadcrumb)
    expect(crumb.data?.url).toBe('/invite/:token')
    const s = scrubSentrySpan(span({ data: cyclicData as SpanJSON['data'] }))
    expect(s.data?.url).toBe('/invite/:token')
    const log = scrubSentryLog({ level: 'warn', message: 'x', attributes: cyclicData })
    expect(log.attributes?.url).toBe('/invite/:token')
  })

  it('is idempotent (beforeSendSpan and beforeSendTransaction both scrub a child span)', () => {
    const once = scrubSentrySpan(
      span({
        description: `GET https://api.example/x?amount=${AMOUNT}&tab=a`,
        data: { 'http.url': `https://api.example/invite/${TOKEN}?amount=${AMOUNT}` },
      }),
    )
    const twice = scrubSentryEvent({ type: 'transaction', spans: [once] }).spans![0]
    expect(twice).toEqual(once)
    expect(once.description).toBe(`GET https://api.example/x?amount=${MASKED_VALUE}&tab=a`)
  })

  it('the failure fallback keeps a transaction a transaction, and redacts', () => {
    const out = scrubSentryEvent(throwing as unknown as Event) as Event
    expect(out.type).toBe('transaction')
    expect(out.transaction).toBe(REDACTED_URL)
    expect(out).not.toHaveProperty('request')
    expect(out.contexts?.trace?.span_id).toBe('s')
    expect(out.spans?.[0].description).toBe(REDACTED_URL)
  })

  it('a span fallback still carries its ids', () => {
    const out = scrubSentrySpan(inputs[7][1] as SpanJSON)
    expect(out.description).toBe(REDACTED_URL)
    expect(typeof out.span_id).toBe('string')
    expect(typeof out.trace_id).toBe('string')
  })
})

describe('real @sentry/browser client', () => {
  afterEach(async () => {
    await SentryBrowser.close()
    window.history.replaceState({}, '', '/')
  })

  async function run(scrubbed: boolean): Promise<string> {
    const payloads: string[] = []
    window.history.replaceState({}, '', '/')
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: `https://futari.example/sign-in?next=/invite/${TOKEN}`,
    })

    SentryBrowser.init({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      defaultIntegrations: false,
      integrations: [
        SentryBrowser.breadcrumbsIntegration({ console: false, dom: false }),
        SentryBrowser.httpContextIntegration(),
      ],
      tracesSampleRate: 1,
      enableLogs: true,
      sendDefaultPii: true,
      transport: () => ({
        send: async envelope => {
          payloads.push(JSON.stringify(envelope))
          return {}
        },
        flush: async () => true,
      }),
      ...(scrubbed
        ? {
            beforeSend: scrubSentryEvent,
            beforeSendTransaction: scrubSentryEvent,
            beforeSendSpan: scrubSentrySpan,
            beforeBreadcrumb: scrubSentryBreadcrumb,
            beforeSendLog: scrubSentryLog,
          }
        : {}),
    })

    // History breadcrumb: `/` → invite page → ledger with filter.
    window.history.pushState({}, '', `/invite/${TOKEN}`)
    window.history.pushState({}, '', `/records?fAmtMin=${AMOUNT}&utm_source=futari_app`)
    SentryBrowser.addBreadcrumb({
      type: 'http',
      category: 'fetch',
      data: { method: 'GET', url: `https://api.example/x?amount=${AMOUNT}` },
    })

    SentryBrowser.captureException(new Error('boom'))

    // `sentry.source: 'url'` is what a real unparameterized pageload carries;
    // the SDK keeps such names out of the envelope's trace header (DSC) by
    // itself (core dynamicSamplingContext.js). The hooks cannot reach that
    // header, so this models the real case rather than a `custom` name.
    SentryBrowser.startSpan(
      { name: `/invite/${TOKEN}`, op: 'pageload', forceTransaction: true, attributes: { 'sentry.source': 'url' } },
      () => {
      SentryBrowser.startSpan(
        {
          name: `GET https://api.example/x?amount=${AMOUNT}`,
          op: 'http.client',
          attributes: {
            'http.url': `https://api.example/x?amount=${AMOUNT}`,
            'http.query': `?amount=${AMOUNT}`,
          },
        },
        () => undefined,
      )
      },
    )

    SentryBrowser.logger.error(`request to /invite/${TOKEN}?fAmtMin=${AMOUNT} failed`)

    await SentryBrowser.flush(2000)
    return payloads.join('\n')
  }

  it('control: without the hooks, the same run leaks (harness captures)', async () => {
    const sent = await run(false)
    expect(sent).toContain(TOKEN)
    expect(sent).toContain(AMOUNT)
    // Each payload type actually reached the transport.
    expect(sent).toContain('"type":"event"')
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('"type":"log"')
    expect(sent).toContain('"navigation"')
  })

  it('with the hooks, nothing leaks and the payloads stay useful', async () => {
    const sent = await run(true)
    expect(sent).toContain('"type":"event"')
    expect(sent).toContain('"type":"transaction"')
    expect(sent).toContain('"type":"log"')
    expect(sent).not.toContain(TOKEN)
    expect(sent).not.toContain(AMOUNT)
    expect(sent).toContain(`/records?fAmtMin=${MASKED_VALUE}&utm_source=futari_app`)
    expect(sent).toContain('/invite/:token')
    expect(sent).not.toContain('"Referer"')
    expect(sent).not.toContain(`${MASKED_VALUE}${MASKED_VALUE}`)
  })
})
