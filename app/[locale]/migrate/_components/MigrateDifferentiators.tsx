/**
 * "Why Futari" block — answers the migrating visitor's "why switch?"
 * before they upload anything (#581). Same three-card shape on every
 * /migrate/<source> page; per-source copy supplies the substance.
 */
export function MigrateDifferentiators({
  heading,
  items,
}: {
  heading: string
  items: readonly { title: string; body: string }[]
}) {
  return (
    <section className="space-y-5">
      <h2
        className="m-0 text-[20px] md:text-[22px] font-medium"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {heading}
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 m-0 p-0 list-none">
        {items.map(({ title, body }, i) => (
          <li
            key={i}
            className="p-5 md:p-6 rounded-tile flex flex-col gap-2"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
            }}
          >
            <span
              className="text-sm md:text-base"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                color: 'var(--ink-3)',
                letterSpacing: '0.6px',
              }}
              aria-hidden
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <p
              className="m-0 text-base md:text-button font-medium"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              {title}
            </p>
            <p
              className="m-0 text-sm md:text-sm leading-[1.65]"
              style={{ color: 'var(--ink-2)' }}
            >
              {body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
