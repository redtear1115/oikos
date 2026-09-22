/**
 * Recognises the Settlement an ended outing folds back into the couple's
 * ledger (actions/outing.ts › endOuting), so the feed can label it
 * 「出遊結算」 instead of the generic 「我還款」.
 *
 * Settlements have no source column; the note is the only signal. The note is
 * written in the locale of whoever ended the outing, so the viewer's own
 * locale is not enough — match every locale's `outing.foldSettlementNote`.
 * These must stay equal to the locale strings; tests/outing-fold-note.test.ts
 * fails when one drifts. Failure looks like: fold rows in that locale quietly
 * fall back to 「我還款」, no error anywhere.
 *
 * A hand-written settlement note of the same shape also matches; that reads
 * fine, so it isn't guarded against.
 */
export const FOLD_SETTLEMENT_NOTE_TEMPLATES = [
  '出遊『{name}』結算',
  '出游『{name}』结算',
  'Outing "{name}" settled',
  'おでかけ「{name}」の精算',
] as const

export function isOutingFoldNote(note: string | null | undefined): boolean {
  if (!note) return false
  return FOLD_SETTLEMENT_NOTE_TEMPLATES.some((template) => {
    const [prefix, suffix] = template.split('{name}')
    return note.length > prefix.length + suffix.length
      && note.startsWith(prefix)
      && note.endsWith(suffix)
  })
}
