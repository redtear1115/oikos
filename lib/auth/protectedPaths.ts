// Edge-safe: 不 import next/headers。proxy 會用。
/**
 * 已知的 auth-walled 頁面根 segment（#1275）。proxy 在未登入導轉 /sign-in 時，
 * 只有第一段落在這份清單裡才帶 `?next=`——登入後回原頁。
 *
 * 為什麼是 allowlist 而不是「非 public 就帶」：
 * - `/api/*` 不是頁面，登入後回去只會看到 JSON。
 * - 未知路徑（打錯字）帶回去只會在登入後撞 404。
 *
 * 清單 = app/(dashboard) 底下的 route 目錄 + app/onboarding + app/setup。
 * tests/protected-paths-allowlist.test.ts 會比對目錄，新增 dashboard 頁卻漏改
 * 這裡時會紅燈。沒擋住的話，失效的樣子不是錯誤，而是那一頁登入後
 * 靜默地落到 /dashboard、不回原頁。
 */
export const PROTECTED_ROOT_SEGMENTS = [
  'dashboard',
  'records',
  'trips',
  'outings',
  'assets',
  'review',
  'settings',
  'coming-soon',
  'onboarding',
  'setup',
] as const

/** 第一段是否完全等於已知 protected segment。`//`、含 `\` 一律 false。 */
export function isKnownProtectedPath(pathname: string): boolean {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) {
    return false
  }
  const seg = pathname.split('/')[1]
  return (PROTECTED_ROOT_SEGMENTS as readonly string[]).includes(seg)
}
