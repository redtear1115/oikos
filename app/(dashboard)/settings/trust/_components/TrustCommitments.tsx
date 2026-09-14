import type { Translations } from '@/lib/i18n/locales/zh-TW'

type TrustStrings = Translations['trust']

/**
 * The three trust commitment cards (encryption / portability / backup).
 * Reused by the in-app /settings/trust page and the bilateral confirmation
 * ritual on /setup and /invite/[token].
 *
 * Portability used to carry an "export coming soon" hint. Export has shipped
 * since v0.12.0 (csv-export-design.md), so the hint was a stale string
 * rendered right under a working export button on /settings/trust (#1190).
 * Don't re-add a caveat here without checking the export route still exists.
 */
export function TrustCommitments({ t }: { t: TrustStrings }) {
  return (
    <div className="space-y-3">
      <TrustSection heading={t.encryption.heading} body={t.encryption.body} />
      <TrustSection heading={t.portability.heading} body={t.portability.body} />
      <TrustSection heading={t.backup.heading} body={t.backup.body} />
    </div>
  )
}

function TrustSection({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      className="rounded-card px-5 py-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}
    >
      <div className="text-base font-medium" style={{ color: 'var(--ink)' }}>
        {heading}
      </div>
      <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--ink-2)' }}>
        {body}
      </p>
    </div>
  )
}
