type Cell = { label: string; tone: 'yes' | 'partial' | 'no' }
type Row = { feature: string; futari: Cell; other: Cell }

// Non-color cue per tone (PRODUCT.md commits to non-color cues for the
// sage/clay distinction; same care applies here). Cell text stays in --ink
// for AA contrast; the leading mark carries the visual signal redundantly.
// This component owns the mark (#1519): labels in sources.ts / comparisonText
// are plain text, so a cell shows exactly one mark. Marks match the ✓ / △ / ✕
// the labels used to carry.
const TONE_GLYPH: Record<Cell['tone'], { mark: string; color: string }> = {
  yes:     { mark: '✓', color: 'var(--saving)' },
  partial: { mark: '△', color: 'var(--ink-2)' },
  no:      { mark: '✕', color: 'var(--ink-3)' },
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
        className="m-0 text-xl md:text-title font-medium"
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
        {/* zh / ja only: with auto layout a CJK cell's min-content is one
            character, so at 320px the columns shrink until a phrase breaks
            mid-word (基本對/半). A fixed layout with a wide first column keeps
            every column as wide as its longest phrase; Latin locales keep
            auto layout, where a long word such as "subscription" widens its
            own column. Rendered here, not in globals.css or the locale
            layout, so the landing's render-blocking bytes stay untouched
            (#1522). */}
        <style
          dangerouslySetInnerHTML={{
            __html:
              ':lang(zh) .cmp-table,:lang(ja) .cmp-table{table-layout:fixed}' +
              ':lang(zh) .cmp-table th:first-child,:lang(ja) .cmp-table th:first-child{width:38%}' +
              '@media(max-width:359px){.cmp-mark{display:block;margin:0}.cmp-head{font-size:var(--fs-xs)}}' +
              '@media(min-width:768px){:lang(zh) .cmp-table th:first-child,:lang(ja) .cmp-table th:first-child{width:32%}}',
          }}
        />
        <table className="cmp-table w-full border-collapse text-sm md:text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-alt)' }}>
              <th
                scope="col"
                className="text-left px-4 md:px-5 py-3 font-medium"
                style={{ color: 'var(--ink-2)', letterSpacing: '0.2px' }}
              />
              <th
                scope="col"
                className="text-center px-2 md:px-4 py-3 font-medium cmp-head"
                style={{ color: 'var(--ink)', letterSpacing: '-0.2px' }}
              >
                {futariLabel}
              </th>
              <th
                scope="col"
                className="text-center px-2 md:px-4 py-3 font-medium cmp-head"
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
                  className="text-left px-2 md:px-5 py-3 font-normal"
                  style={{ color: 'var(--ink)' }}
                >
                  {row.feature}
                </th>
                <td className="text-center px-2 md:px-4 py-3" style={{ color: 'var(--ink)' }}>
                  <span
                    aria-hidden="true"
                    className="cmp-mark inline-block mr-1"
                    style={{ color: TONE_GLYPH[row.futari.tone].color }}
                  >
                    {TONE_GLYPH[row.futari.tone].mark}
                  </span>
                  {row.futari.label}
                </td>
                <td className="text-center px-2 md:px-4 py-3" style={{ color: 'var(--ink)' }}>
                  <span
                    aria-hidden="true"
                    className="cmp-mark inline-block mr-1"
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
