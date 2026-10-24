import { QUICK_ADD_SCHEME } from '@/lib/quickAdd'
import { APP_URL } from '@/lib/i18n/seo'

/** Order the nine pickable categories are listed in (same as docs/shortcuts/linepay-quick-add.md). */
export const CATEGORY_IDS = [
  'dining',
  'clothing',
  'housing',
  'transit',
  'education',
  'entertainment',
  'health',
  'financial',
  'other',
] as const

/**
 * The URLs the guide tells people to paste. `[x]` marks where the Shortcuts
 * variable goes. tests/feature-shortcuts-1750.test.tsx fills the markers and
 * runs the result through lib/quickAdd.ts, so this text and the parser cannot
 * drift apart: failure looks like a guide whose URL silently opens a blank form.
 *
 * #1822 — removed `&category=dining` from the examples. When no category is
 * passed, merchant memory takes over (the most recent transaction with the
 * same merchant/note), falling back to AddSheet's default category (dining)
 * when no prior record exists. This lets the category auto-update based on
 * the user's own history, rather than being locked to a hardcoded value.
 */
export function appUrl(amountVar: string, noteVar: string): string {
  return `${QUICK_ADD_SCHEME}://add?amount=[${amountVar}]&note=[${noteVar}]`
}

export function webUrl(amountVar: string, noteVar: string): string {
  return `${APP_URL}/dashboard#add=expense&amount=[${amountVar}]&note=[${noteVar}]`
}
