import { PICKABLE_CATEGORIES, type CategoryId } from '@/lib/categories'
import { MAX_AMOUNT } from '@/lib/validators'

/**
 * Quick add from outside the app (#1488): an iOS Shortcut (e.g. one that reads
 * a LINE Pay 「付款完成」 notification on device) opens Futari with 記一筆
 * prefilled. The user still reviews and taps save — nothing is written here.
 *
 * Two entry shapes, both parsed by this module only:
 *   - native shell: `dev.southernlight.futari://add?amount=120&category=dining&note=…`
 *   - web / PWA:    `/dashboard#add=expense&amount=120&category=dining&note=…`
 *     (a fragment, so the values never reach the server, Vercel logs, or the
 *     analytics URL sanitizer — which drops `#hash` anyway).
 *
 * Every value is untrusted. Only amount / category / note are read; id, kind,
 * tripId, payer, split, date and currency are never taken from a URL — they
 * keep AddSheet's create-mode defaults. A value that fails its check is
 * dropped on its own (the field falls back to the sheet's default); a URL that
 * is not ours returns null.
 *
 * Usage guide for the Shortcut: docs/shortcuts/linepay-quick-add.md.
 */

export const QUICK_ADD_SCHEME = 'dev.southernlight.futari'

/** Same cap the outing description uses (lib/outing/validate.ts). */
export const QUICK_ADD_NOTE_MAX = 100

export interface QuickAddPrefill {
  amount?: number
  category?: CategoryId
  description?: string
}

const FULLWIDTH_DIGIT_RE = /[０-９]/g
// C0/C1 controls plus the bidi embedding / override / isolate / mark
// characters — the ones that can make a note render differently from what it
// stores (e.g. RLO flipping "500" into "005" on screen).
const STRIP_FROM_NOTE_RE = /[\u0000-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩]/g

function parseAmount(raw: string | null): number | undefined {
  if (raw === null) return undefined
  const normalised = raw
    .trim()
    .replace(FULLWIDTH_DIGIT_RE, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/,/g, '')
  // Digits only: rejects `1e5`, `-5`, `1.5`, `0x10`, and empty after stripping.
  if (!/^\d+$/.test(normalised)) return undefined
  const n = Number(normalised)
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_AMOUNT) return undefined
  return n
}

function parseCategory(raw: string | null): CategoryId | undefined {
  if (raw === null) return undefined
  // Exact match against the pickable ids — never an `in` / index lookup, so
  // `__proto__` / `constructor` cannot match, and `settle` is not pickable.
  return PICKABLE_CATEGORIES.find((c) => c.id === raw)?.id
}

function parseNote(raw: string | null): string | undefined {
  if (raw === null) return undefined
  const cleaned = raw.replace(STRIP_FROM_NOTE_RE, '').trim()
  if (!cleaned) return undefined
  // Cap by code point so a surrogate pair is never split in half.
  return Array.from(cleaned).slice(0, QUICK_ADD_NOTE_MAX).join('').trim()
}

function prefillFromParams(params: URLSearchParams): QuickAddPrefill {
  const prefill: QuickAddPrefill = {}
  const amount = parseAmount(params.get('amount'))
  if (amount !== undefined) prefill.amount = amount
  const category = parseCategory(params.get('category'))
  if (category !== undefined) prefill.category = category
  const description = parseNote(params.get('note'))
  if (description !== undefined) prefill.description = description
  return prefill
}

/**
 * `dev.southernlight.futari://add?…` → prefill; anything else (including the
 * OAuth `login-callback` deep link) → null. Pure: no side effects either way.
 *
 * The host must be exactly `add`. The scheme is not a "special" WHATWG scheme,
 * so the host is opaque and is NOT lowercased: `ADD` does not match. Userinfo
 * moves the host (`add@evil.com` has host `evil.com`), so it does not match
 * either. The path is ignored — values come from the query only.
 */
export function parseQuickAddSchemeUrl(raw: string): QuickAddPrefill | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== `${QUICK_ADD_SCHEME}:`) return null
  if (url.hostname !== 'add') return null
  return prefillFromParams(url.searchParams)
}

/**
 * `#add=expense&amount=…` (the fragment, with or without the leading `#`) →
 * prefill; anything else → null. Only `expense` is supported (income is a
 * non-goal of #1488).
 */
export function parseQuickAddHash(hash: string): QuickAddPrefill | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (!body) return null
  const params = new URLSearchParams(body)
  if (params.get('add') !== 'expense') return null
  return prefillFromParams(params)
}
