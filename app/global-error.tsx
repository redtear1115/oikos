'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect, useState } from 'react'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales-meta'
import { globalErrorCopy, pickGlobalErrorLocale } from '@/lib/i18n/globalErrorCopy'
import './globals.css'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Starts at DEFAULT_LOCALE (matches what a server pass would produce, since
  // `document`/`navigator` don't exist there) and only switches after mount.
  // Picking the real locale directly in `useState(() => …)` would run during
  // the first client render too, which can disagree with the server-rendered
  // HTML React already sent down for this same paint and trip a hydration
  // mismatch. The trade-off is a one-frame flash of zh-TW copy for non-zh-TW
  // users, which is the right side to take it on: this page exists because
  // something already broke, so a correctness-over-flash choice here is fine.
  const [locale, setLocale] = useState(DEFAULT_LOCALE)

  useEffect(() => {
    Sentry.captureException(error)
    setLocale(pickGlobalErrorLocale())
  }, [error])

  const t = globalErrorCopy[locale]

  return (
    <html lang={locale}>
      <body>
        <main
          className="min-h-dvh flex flex-col items-center justify-center px-6 py-16 text-center"
          style={{ background: 'var(--bg)' }}
        >
          <div className="max-w-md w-full">
            <h1
              className="text-page mb-3"
              style={{ fontFamily: 'var(--font-fraunces)', color: 'var(--ink)', fontWeight: 500 }}
            >
              {t.title}
            </h1>
            <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--ink-2)' }}>
              {t.body}
            </p>

            <button
              type="button"
              onClick={reset}
              className="w-full inline-flex items-center justify-center gap-2 rounded-bubble font-medium oik-btn transition-opacity duration-150 h-[var(--control-lg)] px-6 text-base border-0 cursor-pointer"
              style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              {t.retry}
            </button>

            {/* Plain <a>, not next/link, on purpose: this page renders when the
                app itself may be broken, so the safest way home is a full
                navigation the router doesn't have to cooperate with. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="block mt-6 text-sm underline-offset-4 hover:underline focus-visible:oik-focus-ring outline-none"
              style={{ color: 'var(--ink-2)' }}
            >
              {t.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
