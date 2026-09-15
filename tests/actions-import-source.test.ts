import { describe, it, expect } from 'vitest'
import './_mocks/db'
import './_mocks/supabase'

import { DETECTED_SOURCES } from '@/lib/csvImport'
import { importCsvBatch, type ImportBatchInputRow, type ImportSource } from '@/actions/import'

/**
 * #1088's second gate. The picker only offering `.csv` was half the bug — the
 * other half was that `VALID_SOURCES` here listed four CSV sources, so an
 * `.ofx` that parsed perfectly client-side still died on「未支援的匯入來源」at
 * submit. Widening the picker without this would have been a downgrade: the
 * file becomes selectable and then fails at the last step.
 *
 * `assertSource` is the very first statement of `importCsvBatch`, ahead of any
 * DB or auth work — so an intentionally invalid `fileName` reveals which gate
 * rejected the call without needing a full transaction mock. Reaching
 *「檔名不正確」means the source cleared.
 */

const ROW: ImportBatchInputRow = {
  type: 'expense',
  amount: 100,
  date: '2026-01-15',
  category: 'dining',
  description: '便利商店',
  paidBy: 'a',
  splitType: 'all_mine',
}

function submit(source: string) {
  return importCsvBatch({
    source: source as ImportSource,
    fileName: '', // deliberately invalid — the next gate after the source check
    totalRows: 1,
    rows: [ROW],
    errors: [],
  })
}

describe('importCsvBatch — source allowlist', () => {
  it.each([...DETECTED_SOURCES])('accepts %s, the label the client detector produces', async (source) => {
    expect(await submit(source)).toEqual({ ok: false, code: 'import_filename_invalid' })
  })

  it('accepts the two non-CSV formats specifically (#1088)', async () => {
    expect(await submit('ofx')).toEqual({ ok: false, code: 'import_filename_invalid' })
    expect(await submit('qif')).toEqual({ ok: false, code: 'import_filename_invalid' })
  })

  it('still rejects a label no detector can produce', async () => {
    expect(await submit('dropbox')).toEqual({ ok: false, code: 'import_source_unsupported', params: { source: 'dropbox' } })
  })
})
