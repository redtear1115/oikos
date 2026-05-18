/**
 * Quiet callout for source-specific background prose — Honeydue is the only
 * page using it today (#580). Hairline left border + italic Fraunces keep
 * the "objective, never aggressive" framing called out in the i18n schema.
 */
export function MigrateIntroCallout({ text }: { text: string }) {
  return (
    <aside
      className="px-5 md:px-6 py-4 md:py-5 rounded-[14px]"
      style={{
        background: 'var(--surface)',
        borderLeft: '2px solid var(--accent-soft)',
      }}
    >
      <p
        className="m-0 text-[14px] md:text-[14.5px] leading-[1.85]"
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
