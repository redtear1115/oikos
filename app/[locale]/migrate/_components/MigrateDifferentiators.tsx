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
        className="text-[13px] m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--accent)',
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
        }}
      >
        {heading}
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 m-0 p-0 list-none">
        {items.map(({ title, body }, i) => (
          <li
            key={i}
            className="p-5 md:p-6 rounded-[18px] flex flex-col gap-2"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
            }}
          >
            <span
              className="text-[13px] md:text-[15px]"
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
              className="m-0 text-[15px] md:text-[16px] font-semibold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              {title}
            </p>
            <p
              className="m-0 text-[13px] md:text-[13.5px] leading-[1.65]"
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
