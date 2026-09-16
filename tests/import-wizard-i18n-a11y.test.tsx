import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { TranslationsProvider } from '@/lib/i18n/client'
import { en } from '@/lib/i18n/locales/en'
import type { ImportRow, ProcessResult } from '@/lib/csvImport'

// #1182 — the import wizard is the one surface a migrating user sees first,
// and it was the one surface that printed `Category.label` (hard-coded zh-TW)
// instead of `t.category[id]`; it also swapped whole steps without moving
// focus or announcing errors.

vi.mock('@/lib/analytics/track', () => ({ track: vi.fn() }))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

const importCsvBatch = vi.fn()
const rollbackImportBatch = vi.fn()
vi.mock('@/actions/import', () => ({
  importCsvBatch: (...a: unknown[]) => importCsvBatch(...a),
  rollbackImportBatch: (...a: unknown[]) => rollbackImportBatch(...a),
}))

const processFile = vi.fn()
vi.mock('@/lib/csvImport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csvImport')>()
  return { ...actual, processFile: (...a: unknown[]) => processFile(...a) }
})

import { StepMapping } from '@/app/(dashboard)/settings/import/_components/StepMapping'
import { StepConfirm } from '@/app/(dashboard)/settings/import/_components/StepConfirm'
import { ImportHistory } from '@/app/(dashboard)/settings/import/_components/ImportHistory'
import { ImportContent } from '@/app/(dashboard)/settings/import/_components/ImportContent'

function EnWrapper({ children }: { children: ReactNode }) {
  return (
    <TranslationsProvider value={en} locale="en">
      {children}
    </TranslationsProvider>
  )
}

function row(partial: Partial<ImportRow>): ImportRow {
  return {
    date: new Date('2026-09-01T00:00:00Z'),
    amount: 120,
    type: 'expense',
    category: 'dining',
    description: 'lunch',
    paidBy: 'a',
    splitType: 'half',
    ...partial,
  } as ImportRow
}

const ROWS: ImportRow[] = [
  row({ category: 'dining' }),
  row({ category: 'transit', description: 'bus' }),
  row({ type: 'income', category: 'salary', description: 'pay' }),
]

describe('import wizard — category names follow the locale (en)', () => {
  it('StepMapping: source column and every target option are English', () => {
    render(
      <EnWrapper>
        <StepMapping
          rows={ROWS}
          categoryMap={{ dining: 'dining', transit: 'transit' }}
          onChange={vi.fn()}
          onBack={vi.fn()}
          onNext={vi.fn()}
        />
      </EnWrapper>,
    )
    const selects = screen.getAllByRole('combobox')
    expect(selects).toHaveLength(2)
    const options = within(selects[0]!).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Dining')
    expect(options).toContain('Transit')
    expect(options.join('')).not.toMatch(/[飲服居交教娛醫金其]/)
    // Left column shows the translated name, not the raw id.
    expect(screen.getByText('Dining', { selector: 'div' })).toBeTruthy()
    expect(screen.queryByText('dining')).toBeNull()
    // Selects have an accessible name tied to their row.
    expect(screen.getByRole('combobox', { name: 'Dining Maps to' })).toBeTruthy()
  })

  it('StepConfirm: preview chips are English for expense and income rows', () => {
    render(
      <EnWrapper>
        <StepConfirm rows={ROWS} invalidCount={0} onBack={vi.fn()} onConfirm={vi.fn()} submitting={false} />
      </EnWrapper>,
    )
    expect(screen.getByText('Dining')).toBeTruthy()
    expect(screen.getByText('Transit')).toBeTruthy()
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.queryByText('飲食')).toBeNull()
    expect(screen.queryByText('薪水')).toBeNull()
  })

  it('ImportHistory: source is the product name, not the stored enum', () => {
    const base = {
      fileName: 'f.csv',
      totalRows: 1,
      importedCount: 1,
      errorCount: 0,
      status: 'completed',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      rolledBackAt: null,
      rollbackable: false,
    }
    render(
      <EnWrapper>
        <ImportHistory
          history={[
            { ...base, id: '1', source: 'honeydue' },
            { ...base, id: '2', source: 'futari_generic' },
          ]}
          onRollback={vi.fn()}
          rollbacking={false}
        />
      </EnWrapper>,
    )
    expect(screen.getByText(/^Honeydue · /)).toBeTruthy()
    expect(screen.getByText(/^Generic CSV · /)).toBeTruthy()
    expect(screen.queryByText(/futari_generic|FUTARI_GENERIC|honeydue ·/)).toBeNull()
  })
})

const PROCESSED: ProcessResult = {
  source: 'honeydue',
  rows: ROWS,
  errors: [],
  warnings: [],
  stats: { total: 3, valid: 3, invalid: 0 },
} as unknown as ProcessResult

function renderWizard() {
  return render(
    <EnWrapper>
      <ImportContent
        viewer={{ id: 'u-a', displayName: 'A' }}
        partner={{ id: 'u-b', displayName: 'B' }}
        viewerIsMemberA
        history={[]}
      />
    </EnWrapper>,
  )
}

async function uploadAndReachMapping(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.csv', { type: 'text/csv' })] } })
  const s2 = en.settings.import.step2.title
  await waitFor(() => expect(screen.getByRole('heading', { name: s2 })).toBeTruthy())
}

describe('import wizard — focus and announcements', () => {
  beforeEach(() => {
    processFile.mockReset().mockResolvedValue(PROCESSED)
    importCsvBatch.mockReset()
    rollbackImportBatch.mockReset()
  })

  it('does not steal focus on first render', () => {
    renderWizard()
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus to the new step heading on every step change', async () => {
    const { container } = renderWizard()
    await uploadAndReachMapping(container)
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.settings.import.step2.title })),
    )

    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.next }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.settings.import.step3.title })),
    )

    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.back }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: en.settings.import.step2.title })),
    )
  })

  it('announces a failed submit with role="alert"', async () => {
    importCsvBatch.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderWizard()
    await uploadAndReachMapping(container)
    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.next }))
    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.next }))
    const confirm = en.settings.import.step4.confirmCta.replace('{count}', '3')
    fireEvent.click(screen.getByRole('button', { name: confirm }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(en.settings.import.errors.submitFailed)
  })

  it('focuses the result heading, described by the imported count', async () => {
    importCsvBatch.mockResolvedValue({ ok: true, data: { batchId: 'b1', importedCount: 3, errorCount: 0 } })
    const { container } = renderWizard()
    await uploadAndReachMapping(container)
    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.next }))
    fireEvent.click(screen.getByRole('button', { name: en.common.navigation.next }))
    fireEvent.click(
      screen.getByRole('button', { name: en.settings.import.step4.confirmCta.replace('{count}', '3') }),
    )
    const heading = await screen.findByRole('heading', { name: en.settings.import.result.successHeading })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    const desc = document.getElementById(heading.getAttribute('aria-describedby')!)
    expect(desc?.textContent).toContain(en.settings.import.result.successBody.replace('{count}', '3'))
  })

  it('announces a parse failure from the upload widget with role="alert"', async () => {
    processFile.mockRejectedValue(new Error('bad file'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderWizard()
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.csv', { type: 'text/csv' })] } })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(en.settings.import.errors.parseFailed)
  })
})
