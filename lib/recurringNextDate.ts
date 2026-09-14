import { formatDateAbsolute } from '@/lib/format-date'

interface RuleDates {
  nextOccurrenceAt: string
  endsOn: string | null
  pausedAt: Date | null
}

/**
 * #1187 — the "next run" line on a recurring-rule list row. Both rule lists
 * are ordered by `nextOccurrenceAt`, so the row shows that date to make the
 * order explainable.
 *
 * Returns null when the stored date doesn't describe a real upcoming run:
 * - paused: `resumeRule` re-snaps the date on resume, so the stored value is
 *   stale while paused (the paused badge already says why nothing will run);
 * - past `endsOn`: the rule will not produce that occurrence.
 */
export function ruleNextDateText(rule: RuleDates, template: string, locale: string): string | null {
  if (rule.pausedAt) return null
  if (rule.endsOn && rule.nextOccurrenceAt > rule.endsOn) return null
  return template.replace('{date}', formatDateAbsolute(rule.nextOccurrenceAt, locale))
}
