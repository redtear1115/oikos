'use client'

import Link from 'next/link'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { MigrateSource } from '@/lib/csvImport'

type MigrateStrings = Translations['migrate']

interface Props {
  t: MigrateStrings
  /** Locale-aware /sign-in href; we append `?from=<source>` here. */
  signInHref: string
  source: MigrateSource
}

/**
 * Primary CTA shown after a successful preview. Tags the sign-in URL with
 * `?from=<source>` so the post-auth onboarding can resume the import in the
 * right importer flow (per-source CSV mapping lives behind auth).
 */
export function MigrateCta({ t, signInHref, source }: Props) {
  const href = appendQuery(signInHref, 'from', source)

  return (
    <div className="space-y-3 text-center">
      <Link
        href={href}
        className="inline-flex items-center justify-center h-12 px-6 rounded-xl text-white text-body font-semibold cursor-pointer"
        style={{ background: 'var(--btn-primary-bg)', letterSpacing: '1.2px', textDecoration: 'none' }}
      >
        {t.cta.button}
      </Link>
      <p className="text-label" style={{ color: 'var(--ink-2)' }}>
        {t.cta.hint}
      </p>
    </div>
  )
}

function appendQuery(href: string, key: string, value: string): string {
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}
