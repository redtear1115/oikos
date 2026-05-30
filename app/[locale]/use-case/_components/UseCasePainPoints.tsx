type PainPoint = { heading: string; body: string }

export function UseCasePainPoints({ items }: { items: readonly PainPoint[] }) {
  return (
    <section className="space-y-4">
      <ul className="m-0 list-none p-0 space-y-4">
        {items.map(({ heading, body }) => (
          <li
            key={heading}
            className="rounded-[16px] px-5 md:px-6 py-4 md:py-5"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
            }}
          >
            <p
              className="m-0 text-body md:text-[15.5px] font-medium"
              style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
            >
              {heading}
            </p>
            <p
              className="m-0 mt-2 text-label md:text-meta leading-[1.7]"
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
