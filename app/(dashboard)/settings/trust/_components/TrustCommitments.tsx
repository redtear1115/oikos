import type { Translations } from '@/lib/i18n/locales/zh-TW'

type TrustStrings = Translations['trust']

/**
 * The three trust commitment cards (encryption / portability / backup).
 * Reused by the in-app /settings/trust page and the bilateral confirmation
 * ritual on /setup and /invite/[token].
 */
export function TrustCommitments({ t }: { t: TrustStrings }) {
  return (
    <div className="space-y-3">
      <TrustSection heading={t.encryption.heading} body={t.encryption.body} />
      <TrustSection
        heading={t.portability.heading}
        body={t.portability.body}
        hint={t.portability.comingSoonHint}
      />
      <TrustSection heading={t.backup.heading} body={t.backup.body} />
    </div>
  )
}

function TrustSection({
  heading,
  body,
  hint,
}: {
  heading: string
  body: string
  hint?: string
}) {
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
      {hint && (
        <div className="text-xs mt-3" style={{ color: 'var(--ink-3)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}
