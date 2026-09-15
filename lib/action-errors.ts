import type { Translations } from './i18n/locales/zh-TW'

/**
 * Expected errors from server actions (#1156 → #1213 → #1223).
 *
 * ## Why errors are *returned*, not thrown
 *
 * #1213 had actions `throw actionError('trip_not_found')` and the client
 * localize `e.message`. That works in dev and fails silently in production:
 * React's RSC server strips the message off anything a server action throws and
 * sends only `{digest}` (`emitErrorChunk` in
 * `react-server-dom-*-server.node.production.js`); the client replaces it with
 * "An error occurred in the Server Components render. The specific message is
 * omitted in production builds…". So every one of the 82 localized codes
 * resolved to the caller's generic fallback for real users, with no error, no
 * warning, and green tests. Next's own guidance: "model expected errors as
 * return values" (`docs/01-app/01-getting-started/10-error-handling.md`).
 *
 * So the wire contract is now:
 *
 *   expected error  → `return { ok: false, code, params? }`  (plain object;
 *                     survives serialization intact)
 *   unexpected error → keep throwing (error boundary + Sentry own it)
 *
 * Action bodies still `throw actionError(code)`. That is deliberate: the throw
 * is the only thing that aborts a `db.transaction` callback or a nested helper
 * correctly, and there are ~130 of those sites. `runAction` (via {@link action})
 * catches them at the export boundary and converts them into the returned
 * failure, so the throw never crosses the wire. An `Error` that is *not*
 * code-shaped is re-thrown untouched.
 *
 * On the client, {@link unwrapAction} turns a returned failure back into a
 * thrown `ActionError`. Within one JS realm nothing is stripped, so `catch` +
 * `describeError` keep working — and they have to keep working anyway, because
 * network failures and unexpected server errors still arrive as exceptions.
 *
 * ## The dictionary
 *
 * The dictionary keys ARE the wire codes (snake_case, same convention as the
 * older `solo_group` / `already_answered` codes), so adding an error is one key
 * in four locale files — there is no separate switch to forget. The
 * `ActionErrorCode` type is derived from the zh-TW dictionary, so raising a
 * code that has no translation fails `tsc`.
 *
 * Parameterised messages (`第 {row} 筆：…`) travel in `params`.
 *
 * ## Failure modes to recognise
 *
 * - A render site that forgets `describeError` shows the raw code
 *   (`trip_not_found`) instead of a sentence.
 * - A code with no dictionary entry shows the caller's generic fallback —
 *   never the code itself.
 * - A call site that forgets `unwrapAction` on a `Promise<ActionResult<void>>`
 *   **silently ignores the failure**: the sheet closes, nothing was written,
 *   and no error is shown. `tsc` cannot catch that one (the result is simply
 *   unused), which is why `tests/action-result-wire.test.ts` greps the call sites.
 */
export type ActionErrorMessages = Translations['errors']['actions']
export type ActionErrorCode = keyof ActionErrorMessages

type ActionErrorParams = Record<string, string | number>

const CODE_RE = /^([a-z][a-z0-9_]*)(?:\?(.*))?$/

/** An expected failure, as it travels from the server action to the client. */
export interface ActionFailure {
  ok: false
  code: string
  params?: Record<string, string>
}

/** A successful action, carrying whatever the action used to return. */
export interface ActionSuccess<T> {
  ok: true
  data: T
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure

/**
 * The error an action body throws for `code`. `message` is still the wire
 * string (`code` or `code?a=1`) so the older `e.message` switches in
 * `membership-errors` / `quiz-errors` keep matching.
 */
export class ActionError extends Error {
  readonly code: string
  readonly params: Record<string, string>

  constructor(code: string, params: Record<string, string> = {}) {
    super(encodeCode(code, params))
    this.name = 'ActionError'
    this.code = code
    this.params = params
  }
}

function encodeCode(code: string, params: Record<string, string>): string {
  const keys = Object.keys(params)
  if (keys.length === 0) return code
  const qs = new URLSearchParams(keys.map((k) => [k, params[k]])).toString()
  return `${code}?${qs}`
}

function normalizeParams(params?: ActionErrorParams): Record<string, string> {
  if (!params) return {}
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
}

/** Build the error an action body should throw for `code`. */
export function actionError(code: ActionErrorCode, params?: ActionErrorParams): ActionError {
  return new ActionError(code, normalizeParams(params))
}

/** Build the value an action returns for `code`, without throwing. */
export function actionFailure(
  code: ActionErrorCode,
  params?: ActionErrorParams,
): ActionFailure {
  return toFailure(code, normalizeParams(params))
}

/** Build the success envelope. */
export function actionOk<T>(data: T): ActionSuccess<T> {
  return { ok: true, data }
}

function toFailure(code: string, params: Record<string, string>): ActionFailure {
  return Object.keys(params).length === 0
    ? { ok: false, code }
    : { ok: false, code, params }
}

function isFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as ActionFailure).ok === false &&
    typeof (value as ActionFailure).code === 'string'
  )
}

/**
 * Classify a caught value as an *expected* failure, or `null` when it is not
 * one and must keep propagating.
 *
 * Expected = an `ActionError`, or any `Error` whose whole message is
 * code-shaped (`^[a-z][a-z0-9_]*(\?…)?$`). The second clause is what keeps the
 * pre-#1156 codes (`balance_not_zero`, `already_answered`, `group_full`,
 * `guardian_disabled`, …) working without rewriting them.
 *
 * Deliberately NOT expected, and therefore re-thrown:
 * - anything carrying a `digest` — that is how Next smuggles `redirect()` and
 *   `notFound()` through the throw channel. Swallowing one would turn a
 *   redirect into a silent no-op.
 * - `Unauthorized`, `找不到家計簿`, validator prose, driver text. None of them
 *   are code-shaped (`^[a-z]` rules out the first, non-ASCII the rest).
 */
export function toActionFailure(e: unknown): ActionFailure | null {
  if (typeof (e as { digest?: unknown })?.digest === 'string') return null
  if (e instanceof ActionError) return toFailure(e.code, e.params)
  const parsed = parseActionError(e)
  return parsed ? toFailure(parsed.code, parsed.params) : null
}

/**
 * Run an action body, converting expected errors into the returned failure.
 * Prefer {@link action}, which applies this at the export boundary.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() }
  } catch (e) {
    const failure = toActionFailure(e)
    if (failure) return failure
    throw e
  }
}

/**
 * Wrap an action body so the export returns `ActionResult`.
 *
 * ```ts
 * export const setRate = action(async (input: SetRateInput) => { … })
 * ```
 *
 * Every export of `actions/*.ts` goes through this — uniformly, including the
 * read-only ones, so no caller has to remember which actions can fail.
 * `tests/action-result-wire.test.ts` enforces that.
 */
export function action<A extends unknown[], R>(
  body: (...args: A) => Promise<R>,
): (...args: A) => Promise<ActionResult<R>> {
  return (...args: A) => runAction(() => body(...args))
}

/**
 * Client side of the boundary: hand back `data`, or throw the `ActionError`
 * the action meant to raise.
 *
 * The re-throw is not a step backwards — the code has already crossed the wire
 * as data by this point. It exists so the ~30 `catch` + `describeError` sites
 * stay as they are; they need `try` / `catch` regardless, for offline and for
 * genuinely unexpected errors.
 *
 * Read the result directly instead of unwrapping when the *code* drives
 * control flow — see `AddSheet` / `IncomeSheet`, which close the sheet and toast
 * on `pending_expense_handled_elsewhere` rather than showing an inline error.
 */
export function unwrapAction<T>(result: ActionResult<T>): T {
  if (result.ok) return result.data
  throw new ActionError(result.code, result.params ?? {})
}

/**
 * Split an expected failure into code + params. Accepts all three shapes the
 * code can arrive in: the returned `ActionFailure`, an `ActionError`, or a
 * legacy `Error` whose message is the bare code. `null` if it is none of them.
 */
export function parseActionError(
  e: unknown,
): { code: string; params: Record<string, string> } | null {
  if (isFailure(e)) return { code: e.code, params: e.params ?? {} }
  if (e instanceof ActionError) return { code: e.code, params: e.params }
  if (!(e instanceof Error) || !e.message) return null
  const m = CODE_RE.exec(e.message)
  if (!m) return null
  const params: Record<string, string> = {}
  if (m[2]) {
    for (const [k, v] of new URLSearchParams(m[2])) params[k] = v
  }
  return { code: m[1], params }
}

/**
 * True when `e` carries one of `codes`. Use this — not a substring match on
 * the rendered message — for control flow, because the rendered message
 * differs per locale.
 */
export function isActionError(e: unknown, ...codes: ActionErrorCode[]): boolean {
  const parsed = parseActionError(e)
  return parsed !== null && (codes as string[]).includes(parsed.code)
}

/** Localize `e` if it carries a known code; `null` otherwise. */
export function translateActionError(
  e: unknown,
  messages: ActionErrorMessages,
): string | null {
  const parsed = parseActionError(e)
  if (!parsed || !Object.prototype.hasOwnProperty.call(messages, parsed.code)) return null
  let out = messages[parsed.code as ActionErrorCode]
  for (const [k, v] of Object.entries(parsed.params)) {
    out = out.replaceAll(`{${k}}`, v)
  }
  return out
}
