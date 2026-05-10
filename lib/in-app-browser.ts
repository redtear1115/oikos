/**
 * In-app browser (WebView) detection.
 *
 * Chat / social apps embed a WebView that breaks the app in two ways:
 *   1. Service Worker / Supabase session sometimes hangs (持續轉圈)
 *   2. Google OAuth refuses to load — Google blocks embedded WebViews per
 *      their secure-browser policy
 *
 * We can't fix either, so we detect the WebView from the User-Agent and
 * tell the user to open the link in a real browser.
 *
 * The list focuses on apps where Taiwanese users actually open links:
 *   LINE, Facebook / Messenger, Instagram, Threads, WeChat, Telegram.
 * False positives are bad (we'd block real Safari/Chrome users), so the
 * matchers are conservative — we only flag UA tokens that are unique to
 * each in-app WebView.
 */

const IN_APP_BROWSER_PATTERNS: ReadonlyArray<RegExp> = [
  / Line\//i,                    // LINE: `... Line/13.0.0`
  /\bFBAN\b|\bFBAV\b/,           // Facebook / Messenger
  /Instagram/,                   // Instagram (Threads also injects this on iOS)
  /\bThreadsWebView\b/,          // Threads (Android)
  /Barcelona/,                   // Threads internal name (some builds)
  /MicroMessenger/i,             // WeChat
  /\bTelegramWebView\b/,         // Telegram (some clients)
  /\bTwitter\b/,                 // X / Twitter in-app
  /\bLinkedInApp\b/i,            // LinkedIn
  /\bKAKAOTALK\b/i,              // KakaoTalk
]

/**
 * True when the given User-Agent looks like a chat/social app's embedded
 * WebView. Pure function — accepts a UA string so it's testable without
 * touching `navigator`.
 */
export function isInAppBrowser(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent))
}

/**
 * Best-effort iOS detection — drives whether to offer the
 * `x-safari-https://` jump shortcut, which only works on iOS.
 */
export function isIos(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false
  return /iPhone|iPad|iPod/.test(userAgent)
}
