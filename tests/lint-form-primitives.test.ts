import { describe, it, expect, beforeAll } from 'vitest'
import { ESLint } from 'eslint'

// #1252 — the ratchet that keeps #1194's migration from unwinding. Without a
// rule, hand-written fields come back one at a time: each looks fine on its
// own screen, and the drift only shows when two sheets are opened together.
//
// This runs the project's real eslint.config.mjs, so it also fails if the
// rule is deleted, renamed, or if its file globs stop matching `app/`.

let eslint: ESLint

beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() })
})

/** Lint a snippet as if it were this path. The file need not exist — ESLint
 *  only uses the path to resolve which config blocks apply. */
async function lintAs(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
}

const wrap = (jsx: string) => `export function Probe() {\n  return (\n    ${jsx}\n  )\n}\n`

describe('no bare <input> / <textarea> in app/ and components/ (#1252)', () => {
  it('flags a hand-written text input and textarea', async () => {
    const input = await lintAs('app/(dashboard)/_probe/Probe.tsx', wrap('<input type="text" />'))
    expect(input).toHaveLength(1)
    expect(input[0].message).toContain('TextInput')

    const area = await lintAs('components/_probe/Probe.tsx', wrap('<textarea rows={3} />'))
    expect(area).toHaveLength(1)
    expect(area[0].message).toContain('TextArea')
  })

  it('flags an input with no type at all, and one whose type is computed', async () => {
    expect(await lintAs('app/_probe/Probe.tsx', wrap('<input value="" />'))).toHaveLength(1)
    // A computed type could be anything, so it is flagged rather than waved
    // through — the safe side of the trade, and rare enough to allow-list.
    expect(await lintAs('app/_probe/Probe.tsx', wrap('<input type={kind} />'))).toHaveLength(1)
  })

  it('leaves the non-text input types alone — no primitive covers them', async () => {
    for (const type of ['checkbox', 'radio', 'range', 'file', 'hidden']) {
      expect(await lintAs('app/_probe/Probe.tsx', wrap(`<input type="${type}" />`))).toHaveLength(0)
    }
  })

  it('leaves the primitives and the documented exceptions alone', async () => {
    const allowed = [
      'components/ui/TextInput.tsx',
      'components/ui/TextArea.tsx',
      'app/(dashboard)/_components/AmountInput.tsx',
      'app/(dashboard)/dashboard/_components/SettlementForm.tsx',
      'app/(dashboard)/dashboard/_components/DescriptionAutocomplete.tsx',
      'app/(dashboard)/review/[month]/_components/MessageEditor.tsx',
    ]
    for (const file of allowed) {
      expect(await lintAs(file, wrap('<input type="text" />'))).toHaveLength(0)
      expect(await lintAs(file, wrap('<textarea />'))).toHaveLength(0)
    }
  })

  it('does not reach outside app/ and components/', async () => {
    expect(await lintAs('tests/_probe/Probe.tsx', wrap('<input type="text" />'))).toHaveLength(0)
  })
})
