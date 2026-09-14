import type { Translations } from './i18n/locales/zh-TW'

/**
 * Error codes thrown by server actions (#1156).
 *
 * Actions used to `throw new Error('<zh-TW sentence>')`, and `describeError`
 * rendered `e.message` verbatim — so en / ja / zh-CN users saw Traditional
 * Chinese whenever an action failed. Actions now throw a code; the client
 * resolves it against `t.errors.actions` at render time.
 *
 * The dictionary keys ARE the wire codes (snake_case, same convention as the
 * older `solo_group` / `already_answered` codes), so adding an error is one key
 * in four locale files — there is no separate switch to forget. The
 * `ActionErrorCode` type is derived from the zh-TW dictionary, so throwing a
 * code that has no translation fails `tsc`.
 *
 * Parameterised messages (`第 {row} 筆：…`) travel as a query string after the
 * code: `import_row_invalid_amount?row=3`. Only the message string survives the
 * server → client boundary, so the params have to live inside it.
 *
 * Failure mode to recognise: if a render site forgets to go through
 * `describeError`, the user sees the raw code (`trip_not_found`) instead of a
 * sentence. If a code is thrown that is not in the dictionary, `describeError`
 * shows the caller's generic fallback — never the code itself.
 */
export type ActionErrorMessages = Translations['errors']['actions']
export type ActionErrorCode = keyof ActionErrorMessages

type ActionErrorParams = Record<string, string | number>

const CODE_RE = /^([a-z][a-z0-9_]*)(?:\?(.*))?$/

/** Build the Error an action should throw for `code`. */
export function actionError(code: ActionErrorCode, params?: ActionErrorParams): Error {
  if (!params) return new Error(code)
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString()
  return new Error(`${code}?${qs}`)
}

/** Split an action error message into code + params. `null` if it isn't code-shaped. */
export function parseActionError(
  e: unknown,
): { code: string; params: Record<string, string> } | null {
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
