/**
 * Format a 健保卡 (Taiwan NHI card) number into 4-4-4 grouped digits.
 *
 * Rules:
 * - Strip all non-digit characters (letters, spaces, dashes, etc.).
 * - Cap to 12 digits total.
 * - Insert a single space every 4 digits.
 *
 * Examples:
 *   formatNhi('1234567890')      → '1234 5678 90'
 *   formatNhi('123456789012')    → '1234 5678 9012'
 *   formatNhi('12345678901234')  → '1234 5678 9012'  (extra digits dropped)
 *   formatNhi('12-3a 4')         → '1234'
 *   formatNhi('')                → ''
 *
 * Note: this is a display-side helper only. It does not validate that the
 * card number is real or complete — friend-test phase, "陪伴 > 評判" — we
 * just nudge the user toward the correct shape via auto-formatting.
 */
export function formatNhi(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12)
  if (digits.length === 0) return ''
  // Group into chunks of 4 and join with single space.
  const groups: string[] = []
  for (let i = 0; i < digits.length; i += 4) {
    groups.push(digits.slice(i, i + 4))
  }
  return groups.join(' ')
}

/**
 * Maximum length of the formatted string: 12 digits + 2 spaces = 14.
 */
export const NHI_MAX_LENGTH = 14
