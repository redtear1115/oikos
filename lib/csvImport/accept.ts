/**
 * File-picker `accept` strings, kept next to the pipeline that has to swallow
 * whatever the picker lets through (#1088).
 *
 * They live in their own dependency-free module so a component can import the
 * value without pulling the parsers into its bundle, and they are split by
 * *what the consuming code can actually parse* — not by what the pipeline is
 * capable of in general:
 *
 *   - `IMPORT_ACCEPT` — the full `processFile` path (import wizard). CSV/TXT go
 *     through the CSV parser, `.ofx` / `.qif` through their own parsers (#586).
 *   - `CSV_ONLY_ACCEPT` — callers that only run `parseCsvText`, i.e. the
 *     anonymous /migrate preview (`lib/migrate/useCsvPreview.ts`). Letting an
 *     `.ofx` through there would not error — it would render a nonsense preview
 *     table, which is worse than the picker greying the file out.
 *
 * `.txt` rides with CSV everywhere: plenty of exporters hand out tab/comma
 * separated `.txt`, and `detectSeparator` already copes.
 */

/** Import wizard: everything `processFile` can parse. */
export const IMPORT_ACCEPT = '.csv,.txt,.ofx,.qif,text/csv'

/** CSV-text-only consumers (the /migrate preview). */
export const CSV_ONLY_ACCEPT = '.csv,.txt,text/csv'
