/**
 * #1274 — scrub URLs, cookies and client IPs out of everything the Sentry SDK
 * sends: error events, transactions, spans, breadcrumbs and logs.
 *
 * ## Why this exists
 *
 * The page URL reaches Sentry through many side doors, not only
 * `event.request.url`:
 *
 * - error events: `request.url`, `request.query_string` (string, pairs or
 *   object — the SDK uses all three), `request.cookies` / `request.headers`
 *   (server `requestDataIntegration`, client `httpContextIntegration` adds
 *   `Referer`), `contexts.nextjs.request_path` (`captureRequestError`),
 *   `user.ip_address`;
 * - transactions **do not go through `beforeSend`** — only
 *   `beforeSendTransaction`. Their name, `contexts.trace.data` (`url.full`,
 *   `http.url`, `http.target`, `http.client_ip`, `http.request.header.*`) and
 *   every child span's `data` / `description` carry the raw URL;
 * - breadcrumbs: navigation `data.from` / `data.to`, fetch / xhr `data.url`;
 * - logs (`enableLogs` + `consoleLoggingIntegration`): whatever text was passed
 *   to `console.error` / `console.warn`.
 *
 * Invite tokens (`/invite/<token>`, `?next=/invite/<token>`) and ledger filter
 * values (`/records?fAmtMin=…`) must not leave through any of them. URL rules
 * are the shared ones from `lib/analytics/urlSanitizer.ts`: path and query
 * keys stay (so issues still group and read well), invite segment becomes
 * `:token`, non-allowlisted query values become `<masked>`.
 *
 * Headers and cookies are removed outright — same on client, server and edge.
 *
 * ## Contract
 *
 * - Pure: no `window`, no `next/*` at import time. Imported by
 *   `instrumentation-client.ts`, `sentry.server.config.ts` and
 *   `sentry.edge.config.ts`.
 * - Every exported hook **never throws** and never returns `null`. Input is
 *   never mutated (fetch breadcrumbs share their `data` object with the fetch
 *   instrumentation). On any internal failure the hook returns a minimal copy
 *   with URL-bearing fields removed or replaced by `REDACTED_URL` — never the
 *   raw input.
 * - Only fixed paths are walked (no recursion), so cyclic input is harmless.
 *
 * ## What failure looks like
 *
 * - **A hook throws** → the SDK drops the event (`beforeSend*` run inside a
 *   promise chain whose rejection is swallowed) or the throw escapes into
 *   whatever called `addBreadcrumb` / `console.error`. The SDK's own warning
 *   is behind `DEBUG_BUILD`, and `next.config.ts` tree-shakes Sentry debug
 *   logging, so production shows nothing: the error feed simply looks like
 *   "no errors". That is why every hook catches.
 * - **A config stops wiring a hook** → nothing errors either; raw URLs,
 *   cookies and client IPs reappear in Sentry and nobody looks there.
 *   `tests/sentry-scrub-wiring.test.ts` is the only thing that turns red.
 */
import type {
  Breadcrumb,
  BreadcrumbHint,
  Event,
  EventHint,
  Log,
  NodeOptions,
} from '@sentry/nextjs'
import {
  ANALYTICS_URL_PARAM_ALLOWLIST,
  MASKED_VALUE,
  REDACTED_URL,
  sanitizeAnalyticsUrl,
} from '@/lib/analytics/urlSanitizer'

/** `SpanJSON` is not re-exported by `@sentry/nextjs`; take it from the hook. */
type SpanJSON = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0]

type AnyRecord = Record<string, unknown>

/** Sentry's own marker for a removed value. */
const FILTERED = '[Filtered]'

const ALLOWED_PARAMS = new Set<string>(ANALYTICS_URL_PARAM_ALLOWLIST)

/**
 * Attribute keys holding a client IP. Names from the SDK source:
 * `http.client_ip` (node-core httpServerSpansIntegration), `user.ip_address`
 * (core requestdata, span path), `client.address` (core mcp-server); the rest
 * are OTel conventions other instrumentations use.
 */
const IP_KEYS = new Set([
  'http.client_ip',
  'client.address',
  'user.ip_address',
  'net.peer.ip',
  'net.sock.peer.addr',
  'network.peer.address',
])

/** Query-only attributes (`?a=b` or `a=b`). */
const QUERY_KEYS = new Set(['http.query', 'url.query', 'query_string'])

/** The `#hash` alone — never needed, dropped. */
const FRAGMENT_KEYS = new Set(['http.fragment', 'url.fragment'])

/** `http.request.header.<name>` / `http.response.header.<name>` span attributes. */
const HEADER_ATTRIBUTE_RE = /^http\.(?:request|response)\.header\./

/** The one header attribute kept: it is what makes browser issues readable. */
const KEPT_HEADER_ATTRIBUTES = new Set(['http.request.header.user_agent'])

/**
 * Attribute / data keys whose value is a URL or path: `url`, `http.url`,
 * `http.target`, `url.full`, `url.path`, `*.referer`, `*_url`, …
 */
function isUrlKey(lowerKey: string): boolean {
  return (
    lowerKey === 'url.full' ||
    lowerKey === 'url.path' ||
    /(?:^|[._])(?:url|href|target|referer|referrer)$/.test(lowerKey)
  )
}

/** Keys inside `event.contexts.<name>` that carry a URL or path. */
const CONTEXT_URL_KEY_RE = /(?:url|path|target|referer|referrer)$/i

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------------------
// String-level scrubbing
// ---------------------------------------------------------------------------

/**
 * A route pattern after `invite` (`/invite/[token]`) is not a secret; keeping
 * it verbatim stops us from renaming parameterized transaction names, which
 * would flip their `transaction_info.source` to `custom`.
 */
const INVITE_ROUTE_PARAM_RE = /(^|\/)invite\/(\[[^\]/?#]*\])(?=[/?#]|$)/i

function sanitizeUrl(value: string): string {
  const out = sanitizeAnalyticsUrl(value)
  const param = INVITE_ROUTE_PARAM_RE.exec(value)
  if (param && !/[?#]/.test(value)) {
    return out.replace(/(^|\/)invite\/:token(?=[/?#]|$)/i, `$1invite/${param[2]}`)
  }
  return out
}

/** Absolute URL or something that starts like a path / query. */
function looksLikeUrl(value: string): boolean {
  return /^\s*(?:[a-z][a-z0-9+.-]*:\/\/|[/\\?])/i.test(value)
}

/**
 * Scrub a value that is supposed to be a URL. Non-URL-looking strings are
 * left alone (so an unrelated value under a `*target` key is not rewritten)
 * unless they carry a query, hash or invite segment — then privacy wins.
 */
function scrubUrlValue(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value
  if (looksLikeUrl(value) || /[?#]|(?:^|\/)invite\//i.test(value)) {
    return sanitizeUrl(value)
  }
  return value
}

/**
 * URLs embedded in free text: `GET /invite/abc?x=1`, `fetch failed:
 * https://…?code=…`. Absolute URLs are always scrubbed; bare paths only when
 * they carry a query, hash or invite segment (so `GET /records` stays
 * byte-identical). No lookbehind — older iOS WebViews reject it at parse
 * time, which would take the whole client Sentry init down with it.
 *
 * `<masked>` counts as part of a URL token: `beforeSendSpan` and
 * `beforeSendTransaction` both scrub the same child span, and without this
 * the second pass would stop at `<` and append a second `<masked>`.
 */
const URL_CHAR = `(?:[^\\s"'<>\`]|${MASKED_VALUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`
const URL_IN_TEXT_RE = new RegExp(
  `([a-z][a-z0-9+.-]*:\\/\\/${URL_CHAR}+)|(^|[\\s("'=])(\\/${URL_CHAR}*)`,
  'gi',
)

function scrubText(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value
  return value.replace(URL_IN_TEXT_RE, (match, abs: string | undefined, lead: string, path: string) => {
    if (abs) return sanitizeUrl(abs)
    if (/[?#]|(?:^|\/)invite\//i.test(path)) return `${lead}${sanitizeUrl(path)}`
    return match
  })
}

function scrubQueryBody(value: string): string {
  const hasMark = value.startsWith('?')
  const body = hasMark ? value.slice(1) : value
  if (body === '') return value
  const out = sanitizeAnalyticsUrl(`?${body}`)
  if (out === REDACTED_URL) return REDACTED_URL
  const cleaned = out.startsWith('?') ? out.slice(1) : out
  return hasMark ? `?${cleaned}` : cleaned
}

function isAllowedParam(key: unknown): boolean {
  return typeof key === 'string' && ALLOWED_PARAMS.has(key.trim().toLowerCase())
}

/**
 * `request.query_string` comes as a string, `[key, value][]` or a plain
 * object depending on the integration. Same shape out; unknown shape → gone.
 */
function scrubQueryString(value: unknown): unknown {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') return scrubQueryBody(value)
  if (Array.isArray(value)) {
    const pairs: Array<[string, string]> = []
    for (const pair of value) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string') continue
      const [key, raw] = pair as [string, unknown]
      pairs.push([key, isAllowedParam(key) && typeof raw === 'string' ? raw : MASKED_VALUE])
    }
    return pairs
  }
  if (isRecord(value)) {
    const out: Record<string, string> = {}
    for (const [key, raw] of Object.entries(value)) {
      out[key] = isAllowedParam(key) && typeof raw === 'string' ? raw : MASKED_VALUE
    }
    return out
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Structure-level scrubbing (throws are caught by the exported hooks)
// ---------------------------------------------------------------------------

/**
 * Span / trace / breadcrumb / log attributes. `extraUrlKeys` adds keys that
 * are URLs only in that container (breadcrumb `from` / `to`).
 */
function scrubAttributes(data: unknown, extraUrlKeys?: ReadonlySet<string>): unknown {
  if (!isRecord(data)) return data
  const out: AnyRecord = {}
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase()
    if (IP_KEYS.has(lower) || FRAGMENT_KEYS.has(lower)) continue
    if (HEADER_ATTRIBUTE_RE.test(lower)) {
      out[key] = KEPT_HEADER_ATTRIBUTES.has(lower) ? value : FILTERED
    } else if (QUERY_KEYS.has(lower)) {
      out[key] = typeof value === 'string' ? scrubQueryBody(value) : scrubQueryString(value)
    } else if (isUrlKey(lower) || extraUrlKeys?.has(lower)) {
      out[key] = scrubUrlValue(value)
    } else if (lower.startsWith('sentry.message.')) {
      // Log template + parameters: free text that may embed a URL.
      out[key] = scrubText(value)
    } else {
      out[key] = value
    }
  }
  return out
}

function scrubRequest(request: unknown): AnyRecord | undefined {
  if (!isRecord(request)) return undefined
  const out: AnyRecord = { ...request }
  if ('url' in out) out.url = scrubUrlValue(out.url)
  if ('query_string' in out) {
    const qs = scrubQueryString(out.query_string)
    if (qs === undefined) delete out.query_string
    else out.query_string = qs
  }
  delete out.cookies
  delete out.headers
  // Older SDKs put `REMOTE_ADDR` here.
  delete out.env
  return out
}

function scrubContexts(contexts: unknown): unknown {
  if (!isRecord(contexts)) return contexts
  const out: AnyRecord = {}
  for (const [name, context] of Object.entries(contexts)) {
    if (!isRecord(context)) {
      out[name] = context
      continue
    }
    const copy: AnyRecord = { ...context }
    for (const [key, value] of Object.entries(copy)) {
      if (name === 'trace' && key === 'data') {
        copy.data = scrubAttributes(value)
      } else if (typeof value === 'string' && CONTEXT_URL_KEY_RE.test(key)) {
        copy[key] = scrubUrlValue(value)
      }
    }
    out[name] = copy
  }
  return out
}

const BREADCRUMB_URL_KEYS: ReadonlySet<string> = new Set(['from', 'to'])

function scrubBreadcrumbInner(breadcrumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...breadcrumb }
  if ('message' in out) out.message = scrubText(out.message) as string | undefined
  if ('data' in out) out.data = scrubAttributes(out.data, BREADCRUMB_URL_KEYS) as Breadcrumb['data']
  return out
}

function scrubSpanInner(span: SpanJSON): SpanJSON {
  const out: SpanJSON = { ...span }
  if ('description' in out) out.description = scrubText(out.description) as string | undefined
  if ('data' in out) out.data = scrubAttributes(out.data) as SpanJSON['data']
  return out
}

function scrubEventInner<T extends Event>(event: T): T {
  const out = { ...event } as T & AnyRecord
  if ('request' in out) {
    const request = scrubRequest(out.request)
    if (request) out.request = request
    else delete out.request
  }
  if (typeof out.transaction === 'string') {
    out.transaction = scrubText(out.transaction) as string
  }
  if ('contexts' in out) out.contexts = scrubContexts(out.contexts) as Event['contexts']
  if (isRecord(out.tags)) {
    const tags: AnyRecord = { ...out.tags }
    for (const [key, value] of Object.entries(tags)) {
      if (isUrlKey(key.toLowerCase())) tags[key] = scrubUrlValue(value)
    }
    out.tags = tags as Event['tags']
  }
  if (isRecord(out.user)) {
    const user: AnyRecord = { ...out.user }
    delete user.ip_address
    out.user = user as Event['user']
  }
  if (Array.isArray(out.spans)) {
    out.spans = out.spans.filter(isRecord).map(s => scrubSpanInner(s as unknown as SpanJSON)) as Event['spans']
  }
  // Second line: breadcrumbs were scrubbed when recorded, but anything added
  // before `init` or via scope data bypasses `beforeBreadcrumb`.
  if (Array.isArray(out.breadcrumbs)) {
    out.breadcrumbs = out.breadcrumbs.filter(isRecord).map(b => scrubBreadcrumbInner(b as Breadcrumb))
  }
  return out
}

function scrubLogInner(log: Log): Log {
  const out: Log = { ...log }
  const message: unknown = out.message
  if (typeof message === 'string') {
    out.message = scrubText(message) as string
  } else if (message !== undefined && message !== null) {
    // Parameterized string (a `String` object). Template and parameters were
    // already copied into `sentry.message.*` attributes, scrubbed below.
    const text = String(message)
    const cleaned = scrubText(text) as string
    if (cleaned !== text) out.message = cleaned
  }
  if ('attributes' in out) out.attributes = scrubAttributes(out.attributes) as Log['attributes']
  return out
}

// ---------------------------------------------------------------------------
// Fallbacks — used only when the scrub above threw
// ---------------------------------------------------------------------------

/** Read a property without letting a throwing getter escape. */
function safeGet(source: unknown, key: string): unknown {
  try {
    return isRecord(source) ? source[key] : undefined
  } catch {
    return undefined
  }
}

function pickScalars(source: unknown, keys: readonly string[]): AnyRecord {
  const out: AnyRecord = {}
  for (const key of keys) {
    const value = safeGet(source, key)
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}

const SPAN_SCALAR_KEYS = [
  'span_id',
  'trace_id',
  'parent_span_id',
  'start_timestamp',
  'timestamp',
  'op',
  'status',
  'origin',
  'is_segment',
] as const

function fallbackSpan(span: unknown): SpanJSON {
  return {
    ...pickScalars(span, SPAN_SCALAR_KEYS),
    span_id: String(safeGet(span, 'span_id') ?? ''),
    trace_id: String(safeGet(span, 'trace_id') ?? ''),
    start_timestamp: Number(safeGet(span, 'start_timestamp') ?? 0),
    description: REDACTED_URL,
    data: { 'sentry.scrub_failed': true },
  } as SpanJSON
}

function fallbackEvent<T>(event: unknown): T {
  const out: AnyRecord = pickScalars(event, [
    'event_id',
    'type',
    'timestamp',
    'start_timestamp',
    'level',
    'platform',
    'environment',
    'release',
    'dist',
  ])
  out.transaction = REDACTED_URL
  out.message = 'Sentry scrub failed; event reduced'
  out.tags = { scrub_failed: 'true' }
  const trace = safeGet(safeGet(event, 'contexts'), 'trace')
  if (isRecord(trace)) {
    out.contexts = {
      trace: { ...pickScalars(trace, SPAN_SCALAR_KEYS), data: { 'sentry.scrub_failed': true } },
    }
  }
  const spans = safeGet(event, 'spans')
  if (Array.isArray(spans)) {
    try {
      out.spans = spans.map(fallbackSpan)
    } catch {
      out.spans = []
    }
  }
  return out as T
}

function fallbackBreadcrumb(breadcrumb: unknown): Breadcrumb {
  return pickScalars(breadcrumb, ['type', 'category', 'level', 'timestamp', 'event_id']) as Breadcrumb
}

function fallbackLog(log: unknown): Log {
  const level = safeGet(log, 'level')
  return {
    level: (typeof level === 'string' ? level : 'error') as Log['level'],
    message: 'Sentry scrub failed; log reduced',
    attributes: { 'sentry.scrub_failed': true },
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** `beforeSend` and `beforeSendTransaction`. Never throws, never returns null. */
export function scrubSentryEvent<T extends Event>(event: T, _hint?: EventHint): T {
  try {
    if (!isRecord(event)) return fallbackEvent<T>(event)
    return scrubEventInner(event)
  } catch {
    return fallbackEvent<T>(event)
  }
}

/**
 * `beforeSendSpan`. Must always return a span — returning nothing only logs a
 * (tree-shaken) warning and sends the original. Note the SDK deep-merges the
 * returned root span back into the transaction, so keys removed here survive
 * on the root span; `beforeSendTransaction` (same scrub) removes them there.
 */
export function scrubSentrySpan(span: SpanJSON): SpanJSON {
  try {
    if (!isRecord(span)) return fallbackSpan(span)
    return scrubSpanInner(span)
  } catch {
    return fallbackSpan(span)
  }
}

/**
 * `beforeBreadcrumb`. The SDK does not catch here: a throw escapes into
 * whoever recorded the breadcrumb (history / fetch handlers, app code).
 */
export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb, _hint?: BreadcrumbHint): Breadcrumb {
  try {
    if (!isRecord(breadcrumb)) return fallbackBreadcrumb(breadcrumb)
    return scrubBreadcrumbInner(breadcrumb)
  } catch {
    return fallbackBreadcrumb(breadcrumb)
  }
}

/**
 * `beforeSendLog`. Not caught by the SDK either — a throw would escape into
 * the `console.error` / `console.warn` call that produced the log.
 */
export function scrubSentryLog(log: Log): Log {
  try {
    if (!isRecord(log)) return fallbackLog(log)
    return scrubLogInner(log)
  } catch {
    return fallbackLog(log)
  }
}

