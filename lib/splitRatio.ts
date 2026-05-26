/**
 * Convert a stored `split_ratio_a` (DB column on `cashTransactions`,
 * `recurringExpenseRules`, `oikosGroups.default_split_ratio_a`) into the
 * viewer's share % so the AddSheet weighted-split slider / labels read
 * truthfully for both members.
 *
 * Background: the DB column is defined as **member A's share %**, but the
 * AddSheet slider state is the **viewer's share %** (the label says
 * "我 X% / 對方 Y%"). For viewer = A the two angles coincide and the bug
 * stayed hidden; for viewer = B opening an existing weighted record we have
 * to flip, otherwise the slider shows the partner's % labelled as the
 * viewer's, the preview text reads the wrong direction, and saving back
 * persists the inverted angle.
 *
 * Returns the fallback when `dbRatioA` is null (record carries no per-row
 * override) — the fallback is already passed in the form's preferred angle
 * by the caller, so no flip is applied there.
 */
export function loadedSplitRatioToViewerShare(
  dbRatioA: number | null | undefined,
  viewerIsA: boolean,
  fallback: number,
): number {
  if (dbRatioA == null) return fallback
  return viewerIsA ? dbRatioA : 100 - dbRatioA
}
