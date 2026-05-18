/**
 * Numbered 3-step walkthrough shared by every /migrate/<source> page.
 * Stays presentational — copy comes from `migrate.pages.<source>.step{N}`.
 */
export function MigrateSteps({
  heading,
  steps,
}: {
  heading: string
  steps: readonly string[]
}) {
  return (
    <section className="space-y-3">
      <h2
        className="text-[13px] m-0"
        style={{ color: 'var(--ink-3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}
      >
        {heading}
      </h2>
      <ol className="m-0 space-y-3 list-none p-0">
        {steps.map((text, i) => (
          <li
            key={i}
            className="flex gap-3 items-start text-[14px] leading-relaxed"
            style={{ color: 'var(--ink-2)' }}
          >
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] shrink-0"
              style={{
                background: 'var(--surface-alt)',
                color: 'var(--ink-2)',
                fontFamily: 'var(--font-fraunces)',
              }}
              aria-hidden
            >
              {i + 1}
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Shared hero block — large title + supporting subtitle. Per-source pages
 * supply the copy from `migrate.pages.<source>.{heroTitle,heroSubtitle}`.
 */
export function MigrateHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="space-y-3 text-center">
      <h1
        className="text-[28px] md:text-[34px] leading-tight m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--ink)',
          fontWeight: 500,
          letterSpacing: '-0.4px',
        }}
      >
        {title}
      </h1>
      <p
        className="text-[15px] md:text-[16px] leading-relaxed m-0 mx-auto"
        style={{ color: 'var(--ink-2)', maxWidth: 480 }}
      >
        {subtitle}
      </p>
    </header>
  )
}
