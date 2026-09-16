/**
 * #1274 — the one place that decides which parts of a URL may leave the app
 * for a third-party analytics / error tool.
 *
 * ## Why this exists
 *
 * Two kinds of URL content are not ours to hand out:
 *
 * - **Invite tokens** live in the path (`/invite/<token>`) and, after a
 *   sign-in bounce, inside `?next=/invite/<token>`. Anyone holding one can
 *   join the household.
 * - **Ledger filters** live in the query (`/records?fAmtMin=…&fQ=…`) — amounts,
 *   search text, category picks.
 *
 * Analytics SDKs copy the page URL into several properties on every event
 * (current URL, pathname, referrer, session-entry URL, …), so leaving a single
 * field unsanitized is enough to leak.
 *
 * ## Contract
 *
 * - Pure: only the global `URL`. No `window`, no `next/*`. Safe to import from
 *   client, node and edge code.
 * - **Never throws.** On any internal failure it returns {@link REDACTED_URL} —
 *   never the input.
 * - Path: the segment after `invite` becomes `:token`. Everything else in the
 *   path is kept, so events still group by route.
 * - `#hash` is dropped.
 * - Query: keys are kept; values survive only for the keys in
 *   {@link ANALYTICS_URL_PARAM_ALLOWLIST} (compared case-insensitively, after
 *   percent-decoding). Every other value becomes {@link MASKED_VALUE}, or the
 *   whole pair is removed with `{ dropUnknown: true }`.
 * - Input forms: absolute `http(s)` keeps its origin (credentials removed);
 *   relative stays relative; `//host/…` stays protocol-relative; custom
 *   schemes with a host (`futari://login-callback?code=…`) get the same
 *   treatment; `blob:`, `data:`, `javascript:` and other opaque forms
 *   (`mailto:`, `tel:`) collapse to `<scheme>:redacted`; `''` / non-strings
 *   give `''`.
 *
 * ## What failure looks like
 *
 * Nothing errors. If a caller stops routing a URL through here, the raw URL
 * simply appears in the third-party tool's URL column again — tokens and
 * amounts included — and nobody looks there. The guardrail tests
 * (`tests/url-sanitizer.test.ts`, `tests/posthog-ledger-masking.test.tsx`)
 * are the only place that turns red.
 *
 * Known limit: query **keys** are kept verbatim by design (they are what
 * makes the event readable). A secret placed in a bare key (`?<secret>`)
 * would pass. No route in this app does that.
 */

/**
 * Query parameters whose values are safe to send: campaign attribution and
 * a handful of UI-state switches that carry no ledger content. Lower-case;
 * matching is case-insensitive.
 */
export const ANALYTICS_URL_PARAM_ALLOWLIST = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'utm_source_platform',
  'from',
  'error',
  'view',
  'range',
  'month',
  'tab',
] as const

/** Replacement for a query value that is not on the allowlist. */
export const MASKED_VALUE = '<masked>'

/** Replacement for the invite path segment. */
export const INVITE_TOKEN_PLACEHOLDER = ':token'

/** What the sanitizer returns when it cannot safely say anything more. */
export const REDACTED_URL = '<redacted-url>'

export interface SanitizeAnalyticsUrlOptions {
  /** Remove non-allowlisted pairs entirely instead of masking their values. */
  dropUnknown?: boolean
}

const ALLOWED = new Set<string>(ANALYTICS_URL_PARAM_ALLOWLIST)

/** Schemes whose URLs have a real host + path + query we can rewrite. */
const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
/** Schemes that are always collapsed, even if they parse with a host. */
const ALWAYS_REDACT_SCHEMES = new Set(['blob', 'data', 'javascript', 'vbscript', 'filesystem'])
/** Base used only to parse relative input; never appears in output. */
const RELATIVE_BASE = 'https://relative.invalid'

export function sanitizeAnalyticsUrl(
  value: unknown,
  opts?: SanitizeAnalyticsUrlOptions,
): string {
  if (typeof value !== 'string' || value === '') return ''
  try {
    return sanitize(value, opts?.dropUnknown === true)
  } catch {
    return REDACTED_URL
  }
}

function sanitize(raw: string, dropUnknown: boolean): string {
  const input = raw.trim()
  if (input === '') return ''

  // Protocol-relative: `//host/path`. Backslashes count as slashes in the
  // WHATWG parser, so `\\host` and `/\host` are the same thing.
  if (/^[\\/]{2}/.test(input)) {
    const url = new URL(input, RELATIVE_BASE)
    return `//${url.host}${sanitizePath(url.pathname)}${sanitizeQuery(url.search, dropUnknown)}`
  }

  const scheme = SCHEME_RE.exec(input)
  if (scheme) {
    const name = scheme[1].toLowerCase()
    if (ALWAYS_REDACT_SCHEMES.has(name)) return `${name}:redacted`
    const url = new URL(input)
    // Opaque URLs (`mailto:a@b`, `tel:…`, `localhost:3000/x` read as a
    // scheme) have no `//authority`; their "path" can be anything, so it is
    // not ours to keep.
    const hasAuthority = url.href.slice(url.protocol.length).startsWith('//')
    if (!hasAuthority) return `${name}:redacted`
    // `url.host` excludes `user:pass@`, which is intentional.
    return `${url.protocol}//${url.host}${sanitizePath(url.pathname)}${sanitizeQuery(url.search, dropUnknown)}`
  }

  // Relative. Parsed against a throwaway base so dot-segments, backslashes and
  // encoding are normalized the same way the browser would; only the path and
  // query come back out.
  if (input.startsWith('#')) return ''
  const url = new URL(input, `${RELATIVE_BASE}/`)
  const query = sanitizeQuery(url.search, dropUnknown)
  if (input.startsWith('?')) return query
  return `${sanitizePath(url.pathname)}${query}`
}

function sanitizePath(pathname: string): string {
  const segments = pathname.split('/')
  // Decided on the original segments, so `/invite/invite/<token>` masks both
  // followers instead of skipping past the second `invite`.
  const out = [...segments]
  for (let i = 0; i < segments.length - 1; i++) {
    if (decodeLoose(segments[i]).toLowerCase() === 'invite' && segments[i + 1] !== '') {
      out[i + 1] = INVITE_TOKEN_PLACEHOLDER
    }
  }
  return out.join('/')
}

function sanitizeQuery(search: string, dropUnknown: boolean): string {
  const body = search.startsWith('?') ? search.slice(1) : search
  if (body === '') return ''
  const out: string[] = []
  for (const pair of body.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const key = decodeLoose(rawKey.replace(/\+/g, ' ')).toLowerCase()
    if (ALLOWED.has(key)) {
      out.push(pair)
    } else if (!dropUnknown) {
      out.push(`${rawKey}=${MASKED_VALUE}`)
    }
  }
  return out.length ? `?${out.join('&')}` : ''
}

/** `decodeURIComponent` that returns its input on malformed escapes. */
function decodeLoose(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
