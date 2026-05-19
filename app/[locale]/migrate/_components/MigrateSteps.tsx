import type { ReactNode } from 'react'

/**
 * Numbered 3-step walkthrough shared by every /migrate/<source> page.
 * Step text can be a plain string or a fragment (CWMoney embeds an inline
 * download link inside step 2 — see #579).
 */
export function MigrateSteps({
  heading,
  steps,
}: {
  heading: string
  steps: readonly ReactNode[]
}) {
  return (
    <section className="space-y-4">
      <h2
        className="text-label m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--accent)',
          letterSpacing: '3.5px',
          textTransform: 'uppercase',
        }}
      >
        {heading}
      </h2>
      <ol className="m-0 list-none p-0 divide-y" style={{ borderColor: 'var(--hairline)' }}>
        {steps.map((node, i) => (
          <li
            key={i}
            className="flex gap-5 items-start text-[14px] md:text-body leading-[1.75] py-4 first:pt-2"
            style={{ color: 'var(--ink-2)', borderColor: 'var(--hairline)' }}
          >
            <span
              className="shrink-0 inline-block text-button md:text-[18px]"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                color: 'var(--ink-3)',
                letterSpacing: '0.8px',
                minWidth: 28,
              }}
              aria-hidden
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex-1 min-w-0">{node}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Shared hero block — italic Fraunces kicker + large title + supporting
 * subtitle. Per-source pages supply copy from `migrate.pages.<source>`.
 */
export function MigrateHero({
  kicker,
  title,
  subtitle,
}: {
  kicker: string
  title: string
  subtitle: string
}) {
  return (
    <header className="space-y-4 text-center md:text-left">
      <p
        className="m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontStyle: 'italic',
          fontSize: 13,
          color: 'var(--accent)',
          letterSpacing: '3.5px',
        }}
      >
        {kicker}
      </p>
      <h1
        className="text-[32px] md:text-[44px] m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--ink)',
          fontWeight: 500,
          letterSpacing: '-0.8px',
          lineHeight: 1.18,
        }}
      >
        {title}
      </h1>
      <p
        className="text-body md:text-[17px] leading-[1.7] m-0 md:max-w-[520px] mx-auto md:mx-0"
        style={{ color: 'var(--ink-2)', maxWidth: 520 }}
      >
        {subtitle}
      </p>
    </header>
  )
}
