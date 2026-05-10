'use client'

/**
 * Client-only helpers for controlling the Serwist-generated service worker.
 * Each helper is a no-op in environments without `navigator.serviceWorker`
 * (SSR, private mode, older browsers) so callers don't need to guard.
 */

const SW_URL = '/sw.js'

export function isSWSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!isSWSupported()) return null
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  await navigator.serviceWorker.ready
  return reg
}

export async function unregisterAllSW(): Promise<void> {
  if (!isSWSupported()) return
  const regs = await navigator.serviceWorker.getRegistrations()
  await Promise.all(regs.map((r) => r.unregister()))
}

/** Delete every Cache Storage bucket the SW has created. Use on toggle-off
 *  and sign-out to remove cached PII from this device. */
export async function clearAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  const names = await caches.keys()
  await Promise.all(names.map((n) => caches.delete(n)))
}

/** Drop only the dynamic HTML cache. Used at sign-out so the next user on the
 *  same device can't see the previous user's cached pages. App shell (precache)
 *  is preserved for fast cold start. */
export async function clearDynamicCache(): Promise<void> {
  if (typeof caches === 'undefined') return
  await caches.delete('dynamic-v1')
}

export async function hasActiveSW(): Promise<boolean> {
  if (!isSWSupported()) return false
  const regs = await navigator.serviceWorker.getRegistrations()
  return regs.length > 0
}
