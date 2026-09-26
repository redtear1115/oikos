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
 *   `Referer`), `request.data` (server action bodies, e.g. the invite token
 *   passed to `acceptInvite`), `contexts.nextjs.request_path`
 *   (`captureRequestError`),
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
 * Headers, cookies and request bodies (`request.data`) are removed outright —
 * same on client, server and edge.
 *
 * Database values (#1289): a Drizzle error message ends in `\nparams: <every
 * bound value>`, and Postgres' detail reads `Key (…)=(<values>)` or `Failing
 * row contains (<values>)`. Server actions strip these at the source
 * (`lib/db/sanitizeError.ts`); this is the second line for everything else
 * (route handlers, server components, a `console.error(err)` anywhere). The
 * free-text fields — exception values, event / logentry messages, breadcrumb
 * messages and console arguments, log messages and parameters — lose the
 * params tail and the value lists; the SQL text and column names stay.
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
 *   The one exception, console arguments / log parameters, is walked with
 *   a depth, node and size budget and an ancestor set (#1439).
 * - Bounded work (#1439): the regex rules see at most 32 KiB of plain text
 *   at a time — a longer stretch is cut to its head and ends in
 *   ` [Filtered: too long]`, the rest dropped, never passed raw. Text up to
 *   256 KiB keeps its JSON structure (so a bulk-insert error still shows its
 *   SQL, code and constraint); longer text is cut first. A console argument
 *   over its budget becomes `[Filtered: too long]`. The hooks run inside the
 *   `console.error` call that produced them, so a slow scrub is a slow
 *   request. Failure looks like nothing: the request is just slower, or a
 *   huge log body arrives cut short.
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
 *
 * The scheme alternative only starts after a character that cannot be part
 * of a scheme (captured as `absLead`, plus any leading digits / `+.-`, which
 * a scheme cannot start with). Without that anchor the engine tried a scheme
 * at every position of a long `[a-z0-9+.-]` run and rescanned the run each
 * time — quadratic: a 100k alphanumeric log line took seconds (#1439). The
 * matches are the same as before: a scheme run is only ever entered at its
 * first letter. The path alternative comes first because the two overlap in
 * one place — a `/` at position 0, which the old order read as a path and
 * the scheme alternative would otherwise take as its lead.
 */
const URL_CHAR = `(?:[^\\s"'<>\`]|${MASKED_VALUE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`
const URL_IN_TEXT_RE = new RegExp(
  `(^|[\\s("'=])(\\/${URL_CHAR}*)|(^|[^a-z0-9+.\\-])([0-9+.\\-]*)([a-z][a-z0-9+.\\-]*:\\/\\/${URL_CHAR}+)`,
  'gi',
)

/** Test-only: lets tests/sentry-scrub-edges.test.ts check the rewrite matches the old pattern. */
export const _URL_IN_TEXT_RE_FOR_TESTS = URL_IN_TEXT_RE

function scrubText(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value
  return value.replace(
    URL_IN_TEXT_RE,
    (match, lead: string, path: string | undefined, absLead: string, absDigits: string, abs: string | undefined) => {
      if (abs) return `${absLead}${absDigits}${sanitizeUrl(abs)}`
      if (path !== undefined && /[?#]|(?:^|\/)invite\//i.test(path)) return `${lead}${sanitizeUrl(path)}`
      return match
    },
  )
}

// Database error text (#1289). Two shapes reach the hooks:
//
// - plain text (`String(err)`, `err.message`): Drizzle's `\nparams: …` tail
//   with a real newline, Postgres' `Key (…)=(…)` / `Failing row contains (…)`;
// - JSON (`console.error(err)` in a Node process: consoleLoggingIntegration
//   formats each non-primitive argument as `JSON.stringify(normalize(arg))`
//   and joins the arguments with spaces, because `util` is not on
//   globalThis): the values sit in the `message` / `stack` strings, in
//   `"params":[…]`, the cause's `"detail"` / `"where"`, and the cause's
//   message (`invalid input syntax for type uuid: \"…\"`).
//
// The JSON shape is handled structurally (#1439): every JSON argument in the
// text is parsed and walked. Inside it the strings are plain text again, and
// an error's `stack` is cleaned by swapping in its cleaned `message` — so the
// tail ends exactly where the message ends, whatever the bound values
// contain. The regex over the escaped text used to guess that end by
// stopping at the first `\n    at `; a value that itself contained a newline
// and `    at ` ended the scrub early and every later value — a ciphertext,
// say — stayed in the log body.
//
// Failure looks like nothing: the values just sit in the Sentry log body.
// tests/sentry-db-error-envelope.test.ts and tests/sentry-scrub-edges.test.ts
// drive a real client to catch it.

/**
 * Longest stretch of plain text the regex rules run over; a longer piece is
 * cut to its head and ends in `TRUNCATED_SUFFIX`. Keeps the work per value
 * bounded (a hook runs inside the `console.error` call that produced it). A
 * normalized Drizzle error with its stack and cause is a few KB.
 */
const MAX_TEXT_LENGTH = 32_768
/**
 * Longest text parsed for JSON arguments as a whole (linear work: a few
 * scans and `JSON.parse`); anything longer is cut to `MAX_TEXT_LENGTH` first.
 */
const MAX_STRUCTURED_LENGTH = 262_144
/** Budget for one non-string console argument / log parameter. */
const MAX_LOOSE_TEXT = 65_536
const MAX_LOOSE_NODES = 2_000
const MAX_DEPTH = 16
/** A value too large to scrub within budget. Never the raw value. */
const TOO_LONG = '[Filtered: too long]'
/** Appended where text was cut. Never followed by the raw rest. */
const TRUNCATED_SUFFIX = ` ${TOO_LONG}`

/** Plain text: `params:` must start a line, so "bad params: x" mid-sentence stays. */
const DB_PARAMS_TAIL_RE = /(^|\n)params: [\s\S]*$/
/**
 * JSON-escaped text that could not be parsed (truncated, malformed): from
 * `\nparams: ` to the end of the piece (see `scrubDbPlain`).
 */
const DB_PARAMS_TAIL_ESCAPED_RE = /\\nparams: /
/**
 * Postgres row detail: `Key (<columns>)=(<values>) already exists.` and
 * `Failing row contains (<values>).` The values are verbatim — they may hold
 * newlines, parentheses and quotes — so the mask runs to the END of the piece,
 * not to the end of the line (#1439 round 3). A `Key (` whose column list is
 * not closed within 256 characters is masked from `Key (` on.
 */
const PG_KEY_DETAIL_RE = /Key \((?:([^)\n]{0,256})\)=\()?[\s\S]*/
const PG_FAILING_ROW_RE = /Failing row contains \([\s\S]*/
/**
 * 22P02 / 22007 / 22008 / 22003-style messages quote the rejected input:
 * `invalid input syntax for type uuid: "<value>"` (also `… for enum "Foo": …`).
 * Only the opening is matched here; see `maskInvalidInput` for where the value
 * ends. Group 1 is `\` when the text is JSON-escaped.
 */
const PG_INVALID_INPUT_HEAD_RE = /invalid input (?:syntax|value) for [^:\n]{0,256}: (\\?)"/

/** JSON keys whose value is bound parameters or row context. */
const DB_VALUE_KEYS = new Set(['params', 'parameters', 'args', 'detail', 'where'])

const JSON_SCALAR_RE = /[^,}\]]*/y

/** End index (exclusive) of the JSON value starting at `start`, or -1. */
function jsonValueEnd(text: string, start: number): number {
  let i = start
  while (i < text.length && /\s/.test(text[i])) i++
  if (text[i] === '"') {
    for (i++; i < text.length; i++) {
      if (text[i] === '\\') i++
      else if (text[i] === '"') return i + 1
    }
    return -1
  }
  if (text[i] === '[' || text[i] === '{') {
    let depth = 0
    for (; i < text.length; i++) {
      const c = text[i]
      if (c === '"') {
        for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++
      } else if (c === '[' || c === '{') depth++
      else if (c === ']' || c === '}') {
        if (--depth === 0) return i + 1
      }
    }
    return -1
  }
  JSON_SCALAR_RE.lastIndex = i
  const m = JSON_SCALAR_RE.exec(text)
  return m ? i + m[0].length : -1
}

/**
 * `"params":[…]`, `"detail":"…"`, … in text that did not parse as JSON: from
 * the first such key to the end → `"params":"[Filtered]"`. Text that did not
 * parse is truncated or malformed, so the end of the value cannot be trusted
 * (a value's own quote may look like its end).
 */
function maskJsonValueKeys(text: string): Plain {
  if (!text.includes('":')) return { text, open: false }
  const re = /"(\w+)"\s*:/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!DB_VALUE_KEYS.has(m[1])) continue
    return { text: `${text.slice(0, m.index + m[0].length)}"${FILTERED}"`, open: true }
  }
  return { text, open: false }
}

/**
 * A scrubbed plain piece. `open` = some rule masked to the end of the piece,
 * so whatever follows (the next console arguments) may be part of that value
 * and is dropped.
 */
type Plain = { text: string; open: boolean }

/**
 * The rejected input of a 22P02-style message, verbatim — it may contain
 * newlines and quotes (`"/x\n<secret>"`, `"x"<secret>"`). Masked from the
 * opening quote to the END of the piece: the closing quote is never searched
 * for, because the text may have been cut (our 32 KiB head, the SDK's
 * `maxValueLength`, a truncated JSON body) and then the last quote in it is
 * one of the value's own (#1439 round 3).
 */
function maskInvalidInput(text: string): Plain {
  const m = PG_INVALID_INPUT_HEAD_RE.exec(text)
  if (!m) return { text, open: false }
  return { text: `${text.slice(0, m.index + m[0].length)}${MASKED_VALUE}${m[1]}"`, open: true }
}

/** Apply `re` once: from its first match to the end becomes `replace(match)`. */
function maskToEnd(piece: Plain, re: RegExp, replace: (m: RegExpExecArray) => string): Plain {
  const m = re.exec(piece.text)
  if (!m) return piece
  return { text: `${piece.text.slice(0, m.index)}${replace(m)}`, open: true }
}

/**
 * The regex rules, for text outside any parsed JSON argument and for every
 * string inside one. A plain piece is untrusted about where a value ends: it
 * may have been cut anywhere, and a value may contain newlines, quotes,
 * parentheses or something that looks like a stack frame or a JSON argument.
 * So every rule masks from its marker to the END of the piece, and the pieces
 * after it are dropped (`open`). Precise masking — keeping the frames after
 * a message, the fields after `params` — only happens on parsed JSON
 * (`scrubDbJson`, `scrubDbStack`), where the structure is known to be
 * complete.
 */
function scrubDbPlain(text: string): Plain {
  let piece = maskInvalidInput(text)
  const keys = maskJsonValueKeys(piece.text)
  piece = { text: keys.text, open: piece.open || keys.open }
  piece = maskToEnd(piece, DB_PARAMS_TAIL_ESCAPED_RE, () => `\\nparams: ${FILTERED}`)
  piece = maskToEnd(piece, PG_KEY_DETAIL_RE, m =>
    m[1] === undefined ? `Key (${MASKED_VALUE})` : `Key (${m[1]})=(${MASKED_VALUE})`)
  piece = maskToEnd(piece, PG_FAILING_ROW_RE, () => `Failing row contains (${MASKED_VALUE})`)
  return piece
}

type Piece = { text: string; json?: unknown }

/** JSON arguments tried per text; the rest is left to the regex rules. */
const MAX_JSON_ATTEMPTS = 16

/**
 * Split text into console arguments that are JSON (each starts the text or
 * follows a space, ends it or precedes a space, and parses) and the plain
 * text around them.
 */
function splitJsonArguments(text: string): Piece[] {
  const pieces: Piece[] = []
  let plainStart = 0
  let attempts = 0
  for (let i = 0; i < text.length && attempts < MAX_JSON_ATTEMPTS; i++) {
    const c = text[i]
    if ((c !== '{' && c !== '[') || (i > 0 && text[i - 1] !== ' ')) continue
    attempts++
    const end = jsonValueEnd(text, i)
    if (end === -1 || (end < text.length && text[end] !== ' ')) continue
    let json: unknown
    try {
      json = JSON.parse(text.slice(i, end))
    } catch {
      continue
    }
    if (i > plainStart) pieces.push({ text: text.slice(plainStart, i) })
    pieces.push({ text: text.slice(i, end), json })
    plainStart = end
    i = end - 1
  }
  if (plainStart < text.length) pieces.push({ text: text.slice(plainStart) })
  return pieces
}

/**
 * An error's stack starts with `Name: message`, so the params tail in it ends
 * exactly where the message does: swap in the cleaned message and clean the
 * header and the rest (the frames) on their own. Only that header occurrence
 * counts — the message must sit on the stack's first line. Anything else (a
 * stack that does not start with its message, a short message that also
 * appears inside the values) gets the plain rules, which cut from
 * `\nparams:` to the end, frames and all.
 */
function scrubDbStack(stack: string, message: unknown, depth: number): string {
  const at = typeof message === 'string' && message !== '' ? stack.indexOf(message) : -1
  if (at === -1 || stack.slice(0, at).includes('\n')) return scrubDbText(stack, depth)
  const msg = message as string
  return (
    scrubDbText(stack.slice(0, at), depth) +
    scrubDbText(msg, depth) +
    scrubDbText(stack.slice(at + msg.length), depth)
  )
}

/**
 * Walk a parsed JSON argument. Same reference back when nothing changed, so
 * an untouched argument keeps its exact text.
 */
function scrubDbJson(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return scrubDbText(value, depth + 1)
  if (typeof value !== 'object' || value === null) return value
  if (depth > MAX_DEPTH) return FILTERED
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map(item => {
      const cleaned = scrubDbJson(item, depth + 1)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return changed ? out : value
  }
  const record = value as AnyRecord
  let changed = false
  const out: AnyRecord = {}
  for (const [key, item] of Object.entries(record)) {
    let cleaned: unknown
    if (DB_VALUE_KEYS.has(key)) cleaned = FILTERED
    else if (key === 'stack' && typeof item === 'string') cleaned = scrubDbStack(item, record.message, depth + 1)
    else cleaned = scrubDbJson(item, depth + 1)
    if (cleaned !== item) changed = true
    out[key] = cleaned
  }
  return changed ? out : value
}

/**
 * Database values out of free text. `depth` counts JSON nested inside JSON
 * strings; past 2 levels only the regex rules run.
 */
function scrubDbText(value: string, depth = 0): string {
  // A real-newline tail can only sit in plain text (JSON escapes newlines):
  // cut it and everything after it, JSON arguments included.
  const text = value.replace(DB_PARAMS_TAIL_RE, `$1params: ${FILTERED}`)
  if (text === '') return text
  const pieces = depth <= 2 && /[{[]/.test(text) ? splitJsonArguments(text) : [{ text }]
  let out = ''
  for (const piece of pieces) {
    if (piece.json !== undefined) {
      const cleaned = scrubDbJson(piece.json, depth)
      out += cleaned === piece.json ? piece.text : JSON.stringify(cleaned)
      continue
    }
    // Bounded regex work: scrub only the head of a long piece and drop the
    // rest. A cut can only remove values, never unmask them, because every
    // plain rule masks to the end of the piece.
    const truncated = piece.text.length > MAX_TEXT_LENGTH
    const scrubbed = scrubDbPlain(truncated ? piece.text.slice(0, MAX_TEXT_LENGTH) : piece.text)
    out += scrubbed.text
    if (truncated) {
      out += TRUNCATED_SUFFIX
      break
    }
    // A mask ran to the end of this piece: the rest may belong to its value.
    if (scrubbed.open) break
  }
  return out
}

/**
 * Free text: database values first, then URLs. Text up to
 * `MAX_STRUCTURED_LENGTH` keeps its structure (a bulk-insert error's JSON
 * body still shows its SQL, code and constraint; only over-long plain pieces
 * are cut); longer text is cut to its first `MAX_TEXT_LENGTH` characters
 * before anything else runs.
 */
function scrubMessageText(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return value
  if (value.length > MAX_STRUCTURED_LENGTH) {
    return `${scrubText(scrubDbText(value.slice(0, MAX_TEXT_LENGTH))) as string}${TRUNCATED_SUFFIX}`
  }
  return scrubText(scrubDbText(value))
}

class OverBudget extends Error {}

/**
 * A value that may or may not be text: console arguments, log parameters,
 * `logentry.params`. Strings are scrubbed; an `Error` becomes its scrubbed
 * `name: message`; an object or array is walked (not serialized — #1439) and
 * a cleaned copy replaces it when something changed. Over budget (size,
 * node count) → `TOO_LONG`.
 */
function scrubLooseValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubMessageText(value)
  if (value instanceof Error) return scrubMessageText(`${value.name}: ${value.message}`)
  if (typeof value !== 'object' || value === null) return value
  const budget = { text: MAX_LOOSE_TEXT, nodes: MAX_LOOSE_NODES }
  try {
    return scrubLooseNode(value, budget, new Set<object>(), 0)
  } catch (err) {
    // A throwing getter / proxy trap: the argument goes, not the whole hook
    // (JSON.stringify throwing used to do the same).
    return err instanceof OverBudget ? TOO_LONG : FILTERED
  }
}

function spendText(budget: { text: number }, text: string): void {
  budget.text -= text.length
  if (budget.text < 0) throw new OverBudget()
}

function scrubLooseNode(
  value: unknown,
  budget: { text: number; nodes: number },
  ancestors: Set<object>,
  depth: number,
): unknown {
  if (typeof value === 'string') {
    if (value === '') return value
    if (--budget.nodes < 0) throw new OverBudget()
    spendText(budget, value)
    return scrubMessageText(value)
  }
  if (typeof value !== 'object' || value === null) return value
  if (value instanceof Error) {
    const text = `${value.name}: ${value.message}`
    spendText(budget, text)
    return scrubMessageText(text)
  }
  // Binary: no text to scan (its JSON form was numbers), and walking a large
  // buffer index by index would blow the node budget for nothing.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value
  if (--budget.nodes < 0) throw new OverBudget()
  if (depth > MAX_DEPTH || ancestors.has(value)) return FILTERED
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      let changed = false
      const out = value.map(item => {
        const cleaned = scrubLooseNode(item, budget, ancestors, depth + 1)
        if (cleaned !== item) changed = true
        return cleaned
      })
      return changed ? out : value
    }
    const record = value as AnyRecord
    let changed = false
    const out: AnyRecord = {}
    for (const key of Object.keys(record)) {
      const item = record[key]
      let cleaned: unknown
      if (DB_VALUE_KEYS.has(key)) {
        cleaned = FILTERED
      } else if (key === 'stack' && typeof item === 'string') {
        spendText(budget, item)
        cleaned = item.length > MAX_TEXT_LENGTH ? TOO_LONG : scrubText(scrubDbStack(item, record.message, 0))
      } else {
        cleaned = scrubLooseNode(item, budget, ancestors, depth + 1)
      }
      if (cleaned !== item) changed = true
      out[key] = cleaned
    }
    return changed ? out : value
  } finally {
    ancestors.delete(value)
  }
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
      // Log template + parameters: free text that may embed a URL or
      // database values; parameters need not be strings.
      out[key] = scrubLooseValue(value)
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
  // The request body. On the server, `httpServerIntegration` buffers textual
  // bodies up to 10 KB and `requestDataIntegration` copies them here — a
  // server action POST carries its arguments, so `acceptInvite(token)` puts
  // the invite token in it, and ledger actions put descriptions and amounts.
  // `sentry.server.config.ts` already turns `data` off; this is the second
  // line, and covers client / edge events that set it some other way.
  // Failure looks like nothing: the token just sits in the issue's
  // "Request → Body" panel.
  delete out.data
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
  if ('message' in out) out.message = scrubMessageText(out.message) as string | undefined
  if ('data' in out) {
    const data = scrubAttributes(out.data, BREADCRUMB_URL_KEYS)
    // Console breadcrumbs keep the raw `console.*` arguments here.
    if (isRecord(data) && Array.isArray(data.arguments)) {
      data.arguments = data.arguments.map(scrubLooseValue)
    }
    out.data = data as Breadcrumb['data']
  }
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
  if (typeof out.message === 'string') out.message = scrubMessageText(out.message) as string
  if (isRecord(out.logentry)) {
    const logentry: AnyRecord = { ...out.logentry }
    if ('message' in logentry) logentry.message = scrubMessageText(logentry.message)
    if (Array.isArray(logentry.params)) logentry.params = logentry.params.map(scrubLooseValue)
    out.logentry = logentry as Event['logentry']
  }
  if (isRecord(out.exception) && Array.isArray(out.exception.values)) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map(v =>
        isRecord(v) && 'value' in v ? { ...v, value: scrubMessageText(v.value) } : v),
    } as Event['exception']
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
    out.message = scrubMessageText(message) as string
  } else if (message !== undefined && message !== null) {
    // Parameterized string (a `String` object). Template and parameters were
    // already copied into `sentry.message.*` attributes, scrubbed below.
    const text = String(message)
    const cleaned = scrubMessageText(text) as string
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

