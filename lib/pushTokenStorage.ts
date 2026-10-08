/**
 * This device's APNs token, remembered so sign-out can remove this device's
 * PushTokens row (#1605 F11). Written by the `registration` listener in
 * lib/pushNotifications.ts, read and cleared by LogoutButton
 * (which hands it to the signOut action, #1617).
 *
 * Native contract surface: runs in every installed shell as soon as it
 * deploys. Every access is wrapped — storage can be unavailable or throw
 * (private mode, blocked site data, a WebView that clears it) and none of
 * that may break registration or sign-out. With nothing stored, sign-out
 * simply skips the delete; the row then stays until the device registers
 * again or APNs answers 410 (accepted residual).
 */
export const PUSH_TOKEN_STORAGE_KEY = 'futari_push_token'

export function readStoredPushToken(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(PUSH_TOKEN_STORAGE_KEY)
    return v ? v : null
  } catch {
    return null
  }
}

export function storePushToken(token: string): void {
  try {
    globalThis.localStorage?.setItem(PUSH_TOKEN_STORAGE_KEY, token)
  } catch {
    // Best-effort; see the module comment.
  }
}

export function clearStoredPushToken(): void {
  try {
    globalThis.localStorage?.removeItem(PUSH_TOKEN_STORAGE_KEY)
  } catch {
    // Best-effort; see the module comment.
  }
}
