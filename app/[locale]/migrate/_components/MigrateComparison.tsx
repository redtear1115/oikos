type Cell = { label: string; tone: 'yes' | 'partial' | 'no' }
type Row = { feature: string; futari: Cell; other: Cell }

// Non-color cue per tone (PRODUCT.md commits to non-color cues for the
// sage/clay distinction; same care applies here). Cell text stays in --ink
// for AA contrast; the leading glyph carries the visual signal redundantly.
const TONE_GLYPH: Record<Cell['tone'], { mark: string; color: string }> = {
  yes:     { mark: '✓', color: 'var(--saving)' },
  partial: { mark: '◐', color: 'var(--ink-2)' },
  no:      { mark: '—', color: 'var(--ink-3)' },
}

/**
 * Side-by-side comparison table: Futari vs the source app (#599).
 * Rendered as a real <table> so screen readers + search engines parse it
 * correctly; the visual treatment leans on hairlines instead of borders
 * to match the migrate page's quiet aesthetic.
 */
export function MigrateComparison({
  heading,
  futariLabel,
  otherLabel,
  rows,
}: {
  heading: string
  futariLabel: string
  otherLabel: string
  rows: readonly Row[]
}) {
  return (
    <section className="space-y-5">
      <h2
        className="m-0 text-[20px] md:text-[22px] font-medium"
        style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
      >
        {heading}
      </h2>
      <div
        className="rounded-tile overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--hairline)',
        }}
      >
        <table className="w-full border-collapse text-sm md:text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-alt)' }}>
              <th
                scope="col"
                className="text-left px-4 md:px-5 py-3 font-medium"
                style={{ color: 'var(--ink-2)', letterSpacing: '0.2px' }}
              />
              <th
                scope="col"
                className="text-center px-3 md:px-4 py-3 font-medium"
                style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
              >
                {futariLabel}
              </th>
              <th
                scope="col"
                className="text-center px-3 md:px-4 py-3 font-medium"
                style={{ color: 'var(--ink-2)', letterSpacing: '-0.2px' }}
              >
                {otherLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.feature}
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <th
                  scope="row"
                  className="text-left px-4 md:px-5 py-3 font-normal"
                  style={{ color: 'var(--ink)' }}
                >
                  {row.feature}
                </th>
                <td className="text-center px-3 md:px-4 py-3" style={{ color: 'var(--ink)' }}>
                  <span
                    aria-hidden="true"
                    className="inline-block mr-1.5"
                    style={{ color: TONE_GLYPH[row.futari.tone].color }}
                  >
                    {TONE_GLYPH[row.futari.tone].mark}
                  </span>
                  {row.futari.label}
                </td>
                <td className="text-center px-3 md:px-4 py-3" style={{ color: 'var(--ink)' }}>
                  <span
                    aria-hidden="true"
                    className="inline-block mr-1.5"
                    style={{ color: TONE_GLYPH[row.other.tone].color }}
                  >
                    {TONE_GLYPH[row.other.tone].mark}
                  </span>
                  {row.other.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
