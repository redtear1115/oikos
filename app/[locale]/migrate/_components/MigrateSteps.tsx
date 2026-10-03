import type { ReactNode } from 'react'
import { Phrase } from '../../_components/Phrase'
import { Ember } from '../../_components/Ember'
import { s } from '../../_components/brand-inner'

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
    <section className={s.band}>
      <h2 className={`${s.h2} m-0 text-xl md:text-title font-medium`}>
        <Phrase text={heading} />
      </h2>
      <ol className={s.rows}>
        {steps.map((node, i) => (
          <li
            key={i}
            // Anchor target for the HowToStep JSON-LD url (`...#step-N`, 1-based)
            // emitted by MigrateHowToJsonLd (#702) — keeps those anchors live.
            id={`step-${i + 1}`}
            className={`${s.row} text-sm md:text-base`}
            style={{ color: 'var(--ink-2)' }}
          >
            <Ember />
            <div className="min-w-0 leading-[1.75]">
              {/* --ink-2 not --ink-3: 4.02:1 on --bg-committed (#1059). */}
              <span className={`${s.num} text-base md:text-lg`} aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>{node}</div>
            </div>
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
        <Phrase text={kicker} />
      </p>
      <h1
        className="text-page md:text-amount-md text-balance m-0"
        style={{
          fontFamily: 'var(--font-fraunces)',
          color: 'var(--ink)',
          fontWeight: 500,
          letterSpacing: '-0.8px',
          lineHeight: 1.18,
        }}
      >
        <Phrase text={title} />
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
