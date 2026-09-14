'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { useTranslations } from '@/lib/i18n/client'
import { track } from '@/lib/analytics/track'
import { MIN_SHELL_VERSION, isShellOutdated, isShellPlatform } from '@/lib/shellVersion'

/** Dismissal is keyed by the threshold that was dismissed, not a plain boolean:
 *  raising `MIN_SHELL_VERSION` is the operational action this whole mechanism
 *  exists for, and someone who waved away the old notice should still see the
 *  new one. `_v1` leaves room to reset everyone if the copy ever changes. */
const DISMISS_KEY = 'futari_shell_update_dismissed_v1'

/**
 * #991 — gentle "your app is older than we now require" strip.
 *
 * Rendered in the dashboard layout, but inert everywhere except an outdated
 * native shell. Browser and PWA visitors are unaffected by design:
 *
 * - `Capacitor.isNativePlatform()` is false, so the effect returns before
 *   anything else happens. `@capacitor/core` is a tiny, already-bundled module
 *   (PushTokenRegistrar in the same layout imports it).
 * - `@capacitor/app` — the plugin that actually reads the shell version — is
 *   behind a dynamic `import()`, so its chunk is never requested on the web.
 *
 * Deliberately a notice and not a gate: the shell still works, the web layer
 * inside it is current, and hard-blocking someone out of their own ledger over
 * a version number is not the register this product speaks in.
 */
export function ShellUpdateNotice() {
  const t = useTranslations()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const platform = Capacitor.getPlatform()
    if (!isShellPlatform(platform)) return

    let active = true
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => {
        if (!active) return
        const outdated = isShellOutdated(platform, info.version)

        // Production-only (the `track` seam no-ops otherwise). One event per
        // app open is enough to build the installed-version distribution that
        // tells us when raising the threshold is safe.
        track('shell_version_seen', {
          shell_platform: platform,
          shell_version: info.version,
          shell_build: info.build,
          shell_min_version: MIN_SHELL_VERSION[platform],
          shell_outdated: outdated,
        })

        if (!outdated) return
        let dismissedAt: string | null = null
        try {
          dismissedAt = window.localStorage.getItem(DISMISS_KEY)
        } catch {
          // Private browsing can throw on read; treat it as "never dismissed".
        }
        if (dismissedAt === MIN_SHELL_VERSION[platform]) return
        setVisible(true)
      })
      .catch(() => {
        // A shell too old to answer getInfo(), or a plugin load failure. Either
        // way there is nothing trustworthy to show, so stay quiet.
      })

    return () => {
      active = false
    }
  }, [])

  if (!visible) return null

  const handleDismiss = () => {
    setVisible(false)
    const platform = Capacitor.getPlatform()
    if (!isShellPlatform(platform)) return
    try {
      window.localStorage.setItem(DISMISS_KEY, MIN_SHELL_VERSION[platform])
    } catch {
      // Failing to persist just means the notice returns next launch.
    }
  }

  return (
    // `shell-top-strip` (globals.css): this notice is the first band in the
    // shell top stack, so it owns the status-bar inset and cancels it for
    // whatever renders below — the deletion banner, the past-chapter bar, the
    // page header. (#1021)
    //
    // It shares the class, and therefore the sticky stack, with the deletion
    // banner. Splitting them so this gentler notice scrolls away was considered
    // and dropped (#1037): the two would then be in different containers, the
    // stack would have to work out whether it is currently the topmost element
    // once the notice scrolled past, and that is the unanswerable question the
    // stack was built to retire. The notice stays bounded the way #991 intended
    // it to be — by being dismissable in one tap, not by scrolling out of reach.
    <div className="shell-top-strip flex items-center justify-between gap-3 px-5 text-sm bg-surface text-ink border-b border-hairline">
      {/* Live region on the sentence, not on the row that holds the control. */}
      <span role="status">{t.shellUpdateNotice.message}</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t.shellUpdateNotice.dismissAriaLabel}
        className="shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 -mr-2 text-title leading-none bg-transparent border-0 cursor-pointer text-ink-3"
      >
        {/* ✕ U+2715 — close-this-surface, same as every dismissible card and
            sheet (#1125). The notice pins to the shell top strip, so it sits
            above whatever the page renders and would otherwise put the other
            spelling on screen next to them. */}
        ✕
      </button>
    </div>
  )
}
