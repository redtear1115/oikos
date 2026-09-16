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
        className="m-0 text-xl md:text-title font-medium"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {heading}
      </h2>
      <ol className="m-0 list-none p-0 divide-y" style={{ borderColor: 'var(--hairline)' }}>
        {steps.map((node, i) => (
          <li
            key={i}
            // Anchor target for the HowToStep JSON-LD url (`...#step-N`, 1-based)
            // emitted by MigrateHowToJsonLd (#702) — keeps those anchors live.
            id={`step-${i + 1}`}
            className="flex gap-5 items-start text-sm md:text-base leading-[1.75] py-4 first:pt-2"
            style={{ color: 'var(--ink-2)', borderColor: 'var(--hairline)' }}
          >
            <span
              className="shrink-0 inline-block text-base md:text-lg"
              style={{
                fontFamily: 'var(--font-fraunces)',
                fontStyle: 'italic',
                // --ink-3 只有 4.02:1 on --bg-committed（#1059）。序號的「退後感」
                // 本來就主要由 italic Fraunces + letterSpacing 承擔，不靠更淺的色階。
                color: 'var(--ink-2)',
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
        className="m-0 text-xs"
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontStyle: 'italic',
          color: 'var(--ink-2)',
          letterSpacing: '3.5px',
        }}
      >
        {kicker}
      </p>
      <h1
        className="text-page md:text-amount-md m-0"
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
        className="text-base leading-[1.7] m-0 md:max-w-[520px] mx-auto md:mx-0"
        style={{ color: 'var(--ink-2)', maxWidth: 520 }}
      >
        {subtitle}
      </p>
    </header>
  )
}
