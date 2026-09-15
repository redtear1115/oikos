import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { I18nWrapper } from './_mocks/i18n'
import { zhTW } from '@/lib/i18n/locales/zh-TW'

// Regression guard for #1088. `.ofx` / `.qif` have had parsers since #586 and
// `processFile` routes to them, but the file picker only ever offered `.csv`,
// so the only way in was drag-and-drop (`onDrop` bypasses `accept` entirely —
// which is why the hole survived so long). The two upload surfaces have
// deliberately *different* filters, so both are pinned here:
//
//   - the signed-in wizard runs the full pipeline → csv/txt/ofx/qif
//   - the anonymous /migrate preview runs `parseCsvText` only → csv/txt, and
//     must NOT widen: an .ofx there renders a nonsense table rather than an
//     error.

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

import { CsvFileUploadWidget } from '@/components/CsvFileUploadWidget'
import { StepSource } from '@/app/(dashboard)/settings/import/_components/StepSource'
import { MigrateTool } from '@/app/[locale]/migrate/_components/MigrateTool'

function acceptOf(container: HTMLElement): string {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  return input!.getAttribute('accept') ?? ''
}

function extensionsOf(accept: string): string[] {
  return accept
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('.'))
}

describe('import wizard file picker (#1088)', () => {
  it('offers every extension the pipeline can parse, not just .csv', () => {
    const { container } = render(
      <I18nWrapper>
        <StepSource
          onFile={vi.fn(async () => {})}
          parseError={null}
          parsed={null}
          onNext={vi.fn()}
          onReset={vi.fn()}
        />
      </I18nWrapper>,
    )
    expect(extensionsOf(acceptOf(container)).sort()).toEqual(['.csv', '.ofx', '.qif', '.txt'])
  })
})

describe('/migrate preview file picker', () => {
  it('stays CSV-only — the preview never runs the OFX / QIF parsers', () => {
    const { container } = render(
      <MigrateTool t={zhTW.migrate} signInHref="/sign-in" hint="honeydue" />,
    )
    const exts = extensionsOf(acceptOf(container))
    expect(exts.sort()).toEqual(['.csv', '.txt'])
    expect(exts).not.toContain('.ofx')
    expect(exts).not.toContain('.qif')
  })
})

describe('CsvFileUploadWidget default', () => {
  it('defaults to CSV text only, so a new caller cannot accidentally accept .ofx', () => {
    const { container } = render(
      <CsvFileUploadWidget onFile={vi.fn()} promptText="prompt" buttonText="button" retryText="retry" />,
    )
    expect(extensionsOf(acceptOf(container)).sort()).toEqual(['.csv', '.txt'])
  })
})
