import Link from 'next/link'
import type { Translations } from '@/lib/i18n/locales/zh-TW'
import type { MigrateSource } from '@/lib/csvImport'
import { appendQueryParam } from '@/lib/analytics/attribution'

type MigrateStrings = Translations['migrate']

interface Props {
  t: MigrateStrings
  /** Locale-aware /sign-in href; we append `?from=<source>` here. */
  signInHref: string
  source: MigrateSource
  /** Fired on click for the conversion funnel (migrate_cta_clicked). */
  onClick?: () => void
}

/**
 * Primary CTA shown after a successful preview. Tags the sign-in URL with
 * `?from=<source>` so the post-auth onboarding can resume the import in the
 * right importer flow (per-source CSV mapping lives behind auth).
 */
export function MigrateCta({ t, signInHref, source, onClick }: Props) {
  const href = appendQueryParam(signInHref, 'from', source)

  return (
    <div className="space-y-3 text-center">
      <Link
        href={href}
        onClick={onClick}
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
