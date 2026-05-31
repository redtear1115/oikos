/**
 * Quiet callout for source-specific background prose — Honeydue is the only
 * page using it today (#580). Warm tonal step + italic Fraunces keep the
 * "objective, never aggressive" framing called out in the i18n schema.
 */
export function MigrateIntroCallout({ text }: { text: string }) {
  return (
    <aside
      className="px-5 md:px-6 py-4 md:py-5 rounded-bubble"
      style={{ background: 'var(--surface-alt)' }}
    >
      <p
        className="m-0 text-sm md:text-base leading-[1.85]"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontStyle: 'italic',
          color: 'var(--ink-2)',
        }}
      >
        {text}
      </p>
    </aside>
  )
}
