/**
 * Resolve the display pair for an asset whose underlying record has both a
 * legal name (`assets.name`, required) and an optional nickname (e.g.
 * `childDetails.nickname`).
 *
 * Display rule:
 * - If nickname is non-empty (after trim) → primary = nickname, secondary = legal name.
 * - Otherwise → primary = legal name, secondary = null.
 *
 * UI components decide the typography (large vs small/muted); this helper
 * only owns the fallback logic so it stays consistent across the header and
 * the list item.
 */
export interface DisplayName {
  primary: string
  secondary: string | null
}

export function resolveDisplayName(legalName: string, nickname: string | null | undefined): DisplayName {
  const nick = nickname?.trim()
  if (nick) {
    return { primary: nick, secondary: legalName }
  }
  return { primary: legalName, secondary: null }
}
