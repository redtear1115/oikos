'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPlatform, isStandalone, type Platform } from '@/lib/install-guide'

// Chromium-only event — not in lib.dom.d.ts.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export interface InstallPromptState {
  platform: Platform
  standalone: boolean
  /** True when a captured Chromium `beforeinstallprompt` event is ready to fire. */
  canPromptInstall: boolean
  /** Fire the captured prompt. No-op when none is available. */
  promptInstall: () => Promise<void>
}

/**
 * Listen for `beforeinstallprompt` and expose platform + standalone state.
 *
 * The browser fires `beforeinstallprompt` once per session when the page is
 * install-eligible; we capture it so the UI can trigger the install dialog
 * from a user gesture later. iOS has no equivalent API — callers fall back
 * to inline instructions when `platform` is `ios-safari` / `ios-other`.
 *
 * Only one consumer per page should hold the captured event — once `prompt()`
 * resolves, the event is spent and won't fire again.
 */
export function useInstallPrompt(): InstallPromptState {
  const [platform, setPlatform] = useState<Platform>('unknown')
  const [standalone, setStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setPlatform(getPlatform())
    setStandalone(isStandalone())

    const handler = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }
    const installedHandler = () => {
      setDeferredPrompt(null)
      setStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    try {
      await deferredPrompt.userChoice
    } finally {
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  return {
    platform,
    standalone,
    canPromptInstall: deferredPrompt !== null,
    promptInstall,
  }
}
