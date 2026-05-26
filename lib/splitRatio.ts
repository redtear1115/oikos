/**
 * Viewer ↔ member-A split-ratio conversion.
 *
 * DB column `split_ratio_a` (cashTransactions / recurringExpenseRules /
 * oikosGroups.default_split_ratio_a) is **member A's share %**. The form / UI
 * layer everywhere — slider, labels ("我 X% / 對方 Y%"), the SplitGlyph "me"
 * bar, the `weightedSub` preview text, CompactRow's `myShare` chip — treats
 * the value as the **viewer's share %**.
 *
 * For viewer = member A the two semantics coincide and the bug stays
 * hidden; for viewer = member B they invert. Without a flip at every
 * UI ↔ DB boundary, B's intent of "我 90%" gets stored as
 * `split_ratio_a = 90` (schema means A=90%, so B=10% — the opposite) and
 * balance calc / row display read the value back as A's % per schema,
 * surfacing wrong amounts.
 *
 * Use `toViewerShare` when bringing a DB value into the UI; use
 * `toMemberAShare` when sending a UI value back to the DB. The mapping is
 * an involution (`f(f(x)) === x`) and the two share an implementation,
 * but the named call-sites document direction at the boundary.
 *
 * Null/undefined input passes through unchanged so callers that haven't
 * resolved their fallback yet can stay terse (e.g. `tx.splitRatioA` from a
 * non-weighted row).
 */
export function toViewerShare(memberAShare: number, viewerIsA: boolean): number
export function toViewerShare(memberAShare: null | undefined, viewerIsA: boolean): null
export function toViewerShare(memberAShare: number | null | undefined, viewerIsA: boolean): number | null
export function toViewerShare(memberAShare: number | null | undefined, viewerIsA: boolean): number | null {
  if (memberAShare == null) return null
  return viewerIsA ? memberAShare : 100 - memberAShare
}

export function toMemberAShare(viewerShare: number, viewerIsA: boolean): number
export function toMemberAShare(viewerShare: null | undefined, viewerIsA: boolean): null
export function toMemberAShare(viewerShare: number | null | undefined, viewerIsA: boolean): number | null
export function toMemberAShare(viewerShare: number | null | undefined, viewerIsA: boolean): number | null {
  if (viewerShare == null) return null
  return viewerIsA ? viewerShare : 100 - viewerShare
}

/**
 * AddSheet edit-mode helper: convert a stored `split_ratio_a` (DB column,
 * member A's share %) into the slider's viewer-share value, falling back
 * to `fallback` when the record carries no per-row override. The fallback
 * is passed through unchanged — it's only used when the record itself
 * doesn't override, and is supplied in the form's preferred angle by the
 * caller (typically `groupDefaultRatioA ?? 50`, which AddSheet leaves raw
 * for parity with the original create-mode default — see PR #784 for the
 * narrow first fix this builds on).
 */
export function loadedSplitRatioToViewerShare(
  dbRatioA: number | null | undefined,
  viewerIsA: boolean,
  fallback: number,
): number {
  if (dbRatioA == null) return fallback
  return viewerIsA ? dbRatioA : 100 - dbRatioA
}
