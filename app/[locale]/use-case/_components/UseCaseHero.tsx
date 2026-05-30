export function UseCaseHero({
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
          color: 'var(--ink-2)',
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
