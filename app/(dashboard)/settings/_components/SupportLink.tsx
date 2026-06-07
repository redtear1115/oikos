'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics/track'

/**
 * Footer link to the Ko-fi support page. Lives as its own client component so
 * the settings page can stay a server component while we still fire the
 * `kofi_link_clicked` analytics event on press.
 */
export function SupportLink({ label }: { label: string }) {
  return (
    <Link
      href="/settings/support"
      className="underline"
      style={{ color: 'var(--ink-3)' }}
      onClick={() => track('kofi_link_clicked', { source: 'settings_footer' })}
    >
      {label}
    </Link>
  )
}
